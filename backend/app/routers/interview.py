"""Interview/session router.

Interviewer creates a session (problem + AI config) and gets a shareable `join_code`; a candidate
joins by code (invite flow). See CLAUDE.md for the data model.
"""

from __future__ import annotations

import secrets
import string
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import get_session
from app.db.models import (
    Event,
    InterviewSession,
    Profile,
    Role,
    Scorecard,
    SessionFile,
    SessionParticipant,
    SessionStatus,
    Transcript,
)
from app.redis_client import publish, session_channel
from app.schemas import (
    GUARDRAIL_PRESETS,
    HALLUCINATION_TYPES,
    CandidateSessionLog,
    CohostLinkOut,
    EventOut,
    JoinRequest,
    JoinResult,
    RunRequest,
    RunResult,
    ScorecardOut,
    SessionCandidateView,
    SessionCreate,
    SessionFileCreate,
    SessionFileOut,
    SessionFileUpdate,
    SessionOut,
    SessionSummary,
    TestResult,
    TranscriptOut,
)
from app.security import get_current_profile, require_role
from app.services import executor, telemetry

router = APIRouter(prefix="/sessions", tags=["interview"])

_CODE_ALPHABET = string.ascii_uppercase + string.digits


async def _generate_join_code(db: AsyncSession) -> str:
    """Allocate a code unique across BOTH invite columns (candidate `join_code` and
    co-host `interviewer_code`) so the two namespaces never collide."""
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        clash = await db.scalar(
            select(InterviewSession.id).where(
                or_(
                    InterviewSession.join_code == code,
                    InterviewSession.interviewer_code == code,
                )
            )
        )
        if clash is None:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a unique join code")


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    interviewer: Annotated[Profile, Depends(require_role(Role.interviewer))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> InterviewSession:
    # Normalize guardrails — multi-select is the canonical form; the singular field is kept for
    # legacy clients. Whatever the client sends, server-side both fields are populated and the
    # list is the authoritative source.
    presets = list(body.guardrail_presets) if body.guardrail_presets else [body.guardrail_preset]
    presets = [p for p in presets if p in GUARDRAIL_PRESETS]
    if not presets:
        presets = ["hints_only"]
    for p in presets:
        if p not in GUARDRAIL_PRESETS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"guardrail preset must be one of {GUARDRAIL_PRESETS}",
            )
    if body.hallucination_type not in HALLUCINATION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"hallucination type must be one of {HALLUCINATION_TYPES}",
        )
    data = body.model_dump()
    data["guardrail_preset"] = presets[0]
    data["guardrail_presets"] = presets
    interview = InterviewSession(
        join_code=await _generate_join_code(db),
        created_by=interviewer.id,
        **data,
    )
    db.add(interview)
    await db.flush()
    # The interviewer (creator) is admitted from the start.
    db.add(
        SessionParticipant(
            session_id=interview.id,
            profile_id=interviewer.id,
            role=Role.interviewer,
            admitted=True,
        )
    )
    await db.commit()
    await db.refresh(interview)
    return interview


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    interviewer: Annotated[Profile, Depends(require_role(Role.interviewer))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[InterviewSession]:
    rows = await db.scalars(
        select(InterviewSession)
        .where(InterviewSession.created_by == interviewer.id)
        .order_by(InterviewSession.created_at.desc())
    )
    return list(rows)


@router.get("/mine", response_model=list[CandidateSessionLog])
async def list_my_candidate_sessions(
    candidate: Annotated[Profile, Depends(require_role(Role.candidate))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[InterviewSession]:
    """Privacy-stripped session log for the candidate dashboard.

    Returns sessions where the caller participated as a candidate. The response schema
    (`CandidateSessionLog`) deliberately omits problem text, code, transcripts, scorecard,
    language, join code, and interviewer identity — candidates see only the kind of interview
    and when it happened.
    """
    rows = await db.scalars(
        select(InterviewSession)
        .join(SessionParticipant, SessionParticipant.session_id == InterviewSession.id)
        .where(
            SessionParticipant.profile_id == candidate.id,
            SessionParticipant.role == Role.candidate,
        )
        .order_by(InterviewSession.created_at.desc())
    )
    return list(rows)


@router.post("/join", response_model=JoinResult)
async def join_session(
    body: JoinRequest,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> JoinResult:
    code = body.join_code.upper()
    interview = await db.scalar(
        select(InterviewSession).where(
            or_(
                InterviewSession.join_code == code,
                InterviewSession.interviewer_code == code,
            )
        )
    )
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code")
    if interview.status == SessionStatus.ended:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview has ended")

    # The role is bound to the LINK, not the joiner's account. The candidate `join_code` admits
    # candidates only; the co-host `interviewer_code` admits interviewers only. This stops a
    # second interviewer from opening the candidate link and bypassing the waiting room.
    link_role = (
        Role.interviewer if interview.interviewer_code == code else Role.candidate
    )
    if link_role == Role.candidate and profile.role != Role.candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This is a candidate invite link. If you're co-interviewing, ask the host for "
                "the interviewer link instead."
            ),
        )
    if link_role == Role.interviewer and profile.role != Role.interviewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This is an interviewer-only link. Use your candidate invite link to join.",
        )

    existing = await db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == interview.id,
            SessionParticipant.profile_id == profile.id,
        )
    )
    if existing is None:
        # Candidates start in the waiting room (admitted=False); interviewers are admitted
        # immediately so they can review the session as soon as they walk in.
        db.add(
            SessionParticipant(
                session_id=interview.id,
                profile_id=profile.id,
                role=link_role,
                admitted=link_role != Role.candidate,
            )
        )
    if interview.status == SessionStatus.pending and link_role == Role.candidate:
        interview.status = SessionStatus.active
    await db.commit()
    return JoinResult(session_id=interview.id, role=link_role)


@router.post("/{session_id}/cohost-link", response_model=CohostLinkOut)
async def get_cohost_link(
    session_id: uuid.UUID,
    interviewer: Annotated[Profile, Depends(require_role(Role.interviewer))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> CohostLinkOut:
    """Mint (idempotently) the interviewer-only invite code for a session. Creator-only — this is
    the link a host shares so another interviewer can observe without taking the candidate seat."""
    interview = await db.get(InterviewSession, session_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if interview.created_by != interviewer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the session creator can do this"
        )
    if not interview.interviewer_code:
        interview.interviewer_code = await _generate_join_code(db)
        await db.commit()
    return CohostLinkOut(interviewer_code=interview.interviewer_code)


@router.get("/{session_id}", response_model=None)
async def get_session_view(
    session_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionOut | SessionCandidateView:
    interview = await db.get(InterviewSession, session_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    participant = await db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == interview.id,
            SessionParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")

    model_name = get_settings().anthropic_model
    # Any interviewer *participant* (creator or a co-interviewer who joined via the interviewer
    # link) sees the full config; candidates get the privacy-stripped view. Membership was
    # already verified above.
    if profile.role == Role.interviewer:
        out = SessionOut.model_validate(interview)
        out.ai_model = model_name
        return out
    cv = SessionCandidateView.model_validate(interview)
    cv.ai_model = model_name
    cv.has_custom_guardrail = bool((interview.guardrail_custom or "").strip())
    return cv


@router.get("/{session_id}/scorecard", response_model=ScorecardOut)
async def get_scorecard(
    session_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Scorecard:
    participant = await db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    card = await db.scalar(select(Scorecard).where(Scorecard.session_id == session_id))
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scorecard not ready")
    return card


async def _require_participant(
    session_id: uuid.UUID, profile: Profile, db: AsyncSession
) -> InterviewSession:
    interview = await db.get(InterviewSession, session_id)
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    participant = await db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return interview


async def _load_files(session_id: uuid.UUID, db: AsyncSession) -> dict[str, str]:
    """Return a {path -> content} dict of non-folder files for a session, or empty if the
    session is still using single-file mode (no rows in session_files)."""
    rows = list(
        await db.scalars(
            select(SessionFile).where(
                SessionFile.session_id == session_id, SessionFile.is_folder.is_(False)
            )
        )
    )
    return {r.path: r.content for r in rows}


@router.post("/{session_id}/run", response_model=RunResult)
async def run_session_code(
    session_id: uuid.UUID,
    body: RunRequest,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> RunResult:
    interview = await _require_participant(session_id, profile, db)
    is_interviewer = profile.role == Role.interviewer
    tests = interview.test_cases or []
    files = await _load_files(session_id, db)
    use_files = bool(files)
    entry = executor.pick_entry_path(interview.language, list(files.keys())) if use_files else None

    if not tests:
        if use_files:
            out = await executor.run_code(
                language=interview.language, files=files, entry=entry or ""
            )
        else:
            out = await executor.run_code(language=interview.language, code=body.code)
        await _log_run(session_id, profile.role.value, 0, 0)
        return RunResult(passed=0, total=0, results=[], stdout=out["stdout"], stderr=out["stderr"])

    results: list[TestResult] = []
    passed = 0
    for i, tc in enumerate(tests):
        if use_files:
            out = await executor.run_code(
                language=interview.language,
                files=files,
                entry=entry or "",
                stdin=str(tc.get("stdin", "")),
                call=str(tc.get("call", "")),
            )
        else:
            out = await executor.run_code(
                language=interview.language,
                code=body.code,
                stdin=str(tc.get("stdin", "")),
                call=str(tc.get("call", "")),
            )
        ok = executor.outputs_match(out["stdout"], str(tc.get("expected", "")))
        passed += int(ok)
        hidden = bool(tc.get("hidden"))
        # Candidates see the *pass/fail* of hidden tests but not the inputs/outputs.
        show = is_interviewer or not hidden
        results.append(
            TestResult(
                name=f"Test {i + 1}",
                passed=ok,
                hidden=hidden,
                stdin=str(tc.get("stdin", "")) if show else None,
                expected=str(tc.get("expected", "")) if show else None,
                actual=out["stdout"] if show else None,
                stderr=out["stderr"] if show else None,
            )
        )
    await _log_run(session_id, profile.role.value, passed, len(tests))
    return RunResult(passed=passed, total=len(tests), results=results)


# --- Multi-file project endpoints ---------------------------------------------------------------
# CRUD over `session_files`. Interviewer can seed files at create-time (wizard), and both sides
# can mutate the tree during the live interview (changes broadcast via the `file_change` WS event
# from ws.py). Folders are rows with is_folder=True and empty content.


def _normalize_path(path: str) -> str:
    """Reject paths with shell metacharacters, parent-traversal, leading slash, or empty
    components. Returns the cleaned forward-slash path."""
    p = path.strip().lstrip("/")
    if not p or ".." in p.split("/") or any(c in p for c in ("\\", "\0")):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return p


@router.get("/{session_id}/files", response_model=list[SessionFileOut])
async def list_files(
    session_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[SessionFile]:
    await _require_participant(session_id, profile, db)
    rows = await db.scalars(
        select(SessionFile)
        .where(SessionFile.session_id == session_id)
        .order_by(SessionFile.is_folder.desc(), SessionFile.path)
    )
    return list(rows)


async def _broadcast_files_dirty(session_id: uuid.UUID) -> None:
    """Notify other sockets in the session that the file tree changed (create / rename /
    delete). Listeners re-fetch via `GET /sessions/{id}/files`. We broadcast on every
    structural mutation; content edits already flow via the `file_change` WS event."""
    await publish(
        session_channel(str(session_id)),
        {"type": "files_dirty", "payload": {}},
    )


@router.post(
    "/{session_id}/files", response_model=SessionFileOut, status_code=status.HTTP_201_CREATED
)
async def create_file(
    session_id: uuid.UUID,
    body: SessionFileCreate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionFile:
    await _require_participant(session_id, profile, db)
    path = _normalize_path(body.path)
    existing = await db.scalar(
        select(SessionFile).where(SessionFile.session_id == session_id, SessionFile.path == path)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="A file or folder with that path exists")
    f = SessionFile(
        session_id=session_id,
        path=path,
        content="" if body.is_folder else body.content,
        is_folder=body.is_folder,
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    await _broadcast_files_dirty(session_id)
    return f


@router.patch("/{session_id}/files/{file_id}", response_model=SessionFileOut)
async def update_file(
    session_id: uuid.UUID,
    file_id: uuid.UUID,
    body: SessionFileUpdate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionFile:
    await _require_participant(session_id, profile, db)
    f = await db.get(SessionFile, file_id)
    if f is None or f.session_id != session_id:
        raise HTTPException(status_code=404, detail="File not found")
    path_changed = False
    if body.path is not None and body.path != f.path:
        new_path = _normalize_path(body.path)
        clash = await db.scalar(
            select(SessionFile).where(
                SessionFile.session_id == session_id, SessionFile.path == new_path
            )
        )
        if clash is not None and clash.id != f.id:
            raise HTTPException(status_code=409, detail="A file at that path exists")
        # Renaming a folder cascades to its descendants so paths stay consistent.
        if f.is_folder:
            old_prefix = f.path.rstrip("/") + "/"
            new_prefix = new_path.rstrip("/") + "/"
            descendants = list(
                await db.scalars(
                    select(SessionFile).where(
                        SessionFile.session_id == session_id,
                        SessionFile.path.startswith(old_prefix),
                    )
                )
            )
            for d in descendants:
                d.path = new_prefix + d.path[len(old_prefix) :]
                d.updated_at = datetime.now(UTC)
        f.path = new_path
        path_changed = True
    if body.content is not None and not f.is_folder:
        f.content = body.content
    f.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(f)
    # Content-only PATCHes don't need to broadcast — the candidate already sent a `file_change`
    # WS event live as they typed. Path renames DO need to broadcast because rename is HTTP-only.
    if path_changed:
        await _broadcast_files_dirty(session_id)
    return f


@router.delete("/{session_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    session_id: uuid.UUID,
    file_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await _require_participant(session_id, profile, db)
    f = await db.get(SessionFile, file_id)
    if f is None or f.session_id != session_id:
        raise HTTPException(status_code=404, detail="File not found")
    # Deleting a folder removes everything underneath it so the tree stays consistent.
    if f.is_folder:
        prefix = f.path.rstrip("/") + "/"
        descendants = list(
            await db.scalars(
                select(SessionFile).where(
                    SessionFile.session_id == session_id,
                    SessionFile.path.startswith(prefix),
                )
            )
        )
        for d in descendants:
            await db.delete(d)
    await db.delete(f)
    await db.commit()
    await _broadcast_files_dirty(session_id)


async def _log_run(session_id: uuid.UUID, actor: str, passed: int, total: int) -> None:
    payload = {"passed": passed, "total": total}
    await telemetry.record_event(
        session_id=str(session_id), actor=actor, event_type="code_run", payload=payload
    )
    await publish(session_channel(str(session_id)), {"type": "code_run", "payload": payload})


@router.get("/{session_id}/events", response_model=list[EventOut])
async def list_session_events(
    session_id: uuid.UUID,
    interviewer: Annotated[Profile, Depends(require_role(Role.interviewer))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[Event]:
    """Chronological event log for the interviewer's replay timeline."""
    await _require_participant(session_id, interviewer, db)
    rows = await db.scalars(
        select(Event).where(Event.session_id == session_id).order_by(Event.created_at)
    )
    return list(rows)


@router.get("/{session_id}/transcripts", response_model=list[TranscriptOut])
async def list_session_transcripts(
    session_id: uuid.UUID,
    interviewer: Annotated[Profile, Depends(require_role(Role.interviewer))],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[Transcript]:
    """Full chat history for the post-mortem summary view. Interviewer-only because the
    `was_hallucinated` flag must never reach a candidate."""
    await _require_participant(session_id, interviewer, db)
    rows = await db.scalars(
        select(Transcript)
        .where(Transcript.session_id == session_id)
        .order_by(Transcript.created_at)
    )
    return list(rows)
