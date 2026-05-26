"""Interview/session router.

Interviewer creates a session (problem + AI config) and gets a shareable `join_code`; a candidate
joins by code (invite flow). See plan.md §4 (data model) and §6 (tasks).
"""

from __future__ import annotations

import secrets
import string
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import get_session
from app.db.models import (
    Event,
    InterviewSession,
    Profile,
    Role,
    Scorecard,
    SessionParticipant,
    SessionStatus,
    Transcript,
)
from app.redis_client import publish, session_channel
from app.schemas import (
    GUARDRAIL_PRESETS,
    CandidateSessionLog,
    EventOut,
    JoinRequest,
    JoinResult,
    RunRequest,
    RunResult,
    ScorecardOut,
    SessionCandidateView,
    SessionCreate,
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
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        clash = await db.scalar(
            select(InterviewSession.id).where(InterviewSession.join_code == code)
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
    if body.guardrail_preset not in GUARDRAIL_PRESETS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"guardrail_preset must be one of {GUARDRAIL_PRESETS}",
        )
    interview = InterviewSession(
        join_code=await _generate_join_code(db),
        created_by=interviewer.id,
        **body.model_dump(),
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
    interview = await db.scalar(
        select(InterviewSession).where(InterviewSession.join_code == body.join_code.upper())
    )
    if interview is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code")
    if interview.status == SessionStatus.ended:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview has ended")

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
                role=profile.role,
                admitted=profile.role != Role.candidate,
            )
        )
    if interview.status == SessionStatus.pending and profile.role == Role.candidate:
        interview.status = SessionStatus.active
    await db.commit()
    return JoinResult(session_id=interview.id, role=profile.role)


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
    if profile.role == Role.interviewer and interview.created_by == profile.id:
        out = SessionOut.model_validate(interview)
        out.ai_model = model_name
        return out
    cv = SessionCandidateView.model_validate(interview)
    cv.ai_model = model_name
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

    if not tests:
        out = await executor.run_code(language=interview.language, code=body.code)
        await _log_run(session_id, profile.role.value, 0, 0)
        return RunResult(passed=0, total=0, results=[], stdout=out["stdout"], stderr=out["stderr"])

    results: list[TestResult] = []
    passed = 0
    for i, tc in enumerate(tests):
        out = await executor.run_code(
            language=interview.language, code=body.code, stdin=str(tc.get("stdin", ""))
        )
        ok = out["stdout"].strip() == str(tc.get("expected", "")).strip()
        passed += int(ok)
        hidden = bool(tc.get("hidden"))
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
