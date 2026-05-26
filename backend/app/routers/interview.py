"""Interview/room router.

Recruiter creates a room (problem + AI config) and gets a shareable `join_code`; a candidate joins
by code (recruiter-invite flow). See plan.md §4 (data model) and §6 (tasks).
"""

from __future__ import annotations

import secrets
import string
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import (
    Event,
    InterviewRoom,
    Profile,
    Role,
    RoomParticipant,
    RoomStatus,
    Scorecard,
)
from app.redis_client import publish, room_channel
from app.schemas import (
    GUARDRAIL_PRESETS,
    EventOut,
    JoinRequest,
    JoinResult,
    RoomCandidateView,
    RoomCreate,
    RoomOut,
    RoomSummary,
    RunRequest,
    RunResult,
    ScorecardOut,
    TestResult,
)
from app.security import get_current_profile, require_role
from app.services import executor, telemetry

router = APIRouter(prefix="/rooms", tags=["interview"])

_CODE_ALPHABET = string.ascii_uppercase + string.digits


async def _generate_join_code(session: AsyncSession) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        clash = await session.scalar(
            select(InterviewRoom.id).where(InterviewRoom.join_code == code)
        )
        if clash is None:
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a unique join code")


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate,
    recruiter: Annotated[Profile, Depends(require_role(Role.recruiter))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> InterviewRoom:
    if body.guardrail_preset not in GUARDRAIL_PRESETS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"guardrail_preset must be one of {GUARDRAIL_PRESETS}",
        )
    room = InterviewRoom(
        join_code=await _generate_join_code(session),
        created_by=recruiter.id,
        **body.model_dump(),
    )
    session.add(room)
    await session.flush()
    session.add(RoomParticipant(room_id=room.id, profile_id=recruiter.id, role=Role.recruiter))
    await session.commit()
    await session.refresh(room)
    return room


@router.get("", response_model=list[RoomSummary])
async def list_rooms(
    recruiter: Annotated[Profile, Depends(require_role(Role.recruiter))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[InterviewRoom]:
    rows = await session.scalars(
        select(InterviewRoom)
        .where(InterviewRoom.created_by == recruiter.id)
        .order_by(InterviewRoom.created_at.desc())
    )
    return list(rows)


@router.post("/join", response_model=JoinResult)
async def join_room(
    body: JoinRequest,
    profile: Annotated[Profile, Depends(get_current_profile)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JoinResult:
    room = await session.scalar(
        select(InterviewRoom).where(InterviewRoom.join_code == body.join_code.upper())
    )
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code")
    if room.status == RoomStatus.ended:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview has ended")

    existing = await session.scalar(
        select(RoomParticipant).where(
            RoomParticipant.room_id == room.id,
            RoomParticipant.profile_id == profile.id,
        )
    )
    if existing is None:
        session.add(RoomParticipant(room_id=room.id, profile_id=profile.id, role=profile.role))
    if room.status == RoomStatus.pending and profile.role == Role.candidate:
        room.status = RoomStatus.active
    await session.commit()
    return JoinResult(room_id=room.id, role=profile.role)


@router.get("/{room_id}", response_model=None)
async def get_room(
    room_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoomOut | RoomCandidateView:
    room = await session.get(InterviewRoom, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    participant = await session.scalar(
        select(RoomParticipant).where(
            RoomParticipant.room_id == room.id,
            RoomParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")

    if profile.role == Role.recruiter and room.created_by == profile.id:
        return RoomOut.model_validate(room)
    return RoomCandidateView.model_validate(room)


@router.get("/{room_id}/scorecard", response_model=ScorecardOut)
async def get_scorecard(
    room_id: uuid.UUID,
    profile: Annotated[Profile, Depends(get_current_profile)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Scorecard:
    participant = await session.scalar(
        select(RoomParticipant).where(
            RoomParticipant.room_id == room_id,
            RoomParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    card = await session.scalar(select(Scorecard).where(Scorecard.room_id == room_id))
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scorecard not ready")
    return card


async def _require_participant(
    room_id: uuid.UUID, profile: Profile, session: AsyncSession
) -> InterviewRoom:
    room = await session.get(InterviewRoom, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    participant = await session.scalar(
        select(RoomParticipant).where(
            RoomParticipant.room_id == room_id,
            RoomParticipant.profile_id == profile.id,
        )
    )
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")
    return room


@router.post("/{room_id}/run", response_model=RunResult)
async def run_room_code(
    room_id: uuid.UUID,
    body: RunRequest,
    profile: Annotated[Profile, Depends(get_current_profile)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RunResult:
    room = await _require_participant(room_id, profile, session)
    is_recruiter = profile.role == Role.recruiter
    tests = room.test_cases or []

    if not tests:
        out = await executor.run_code(language=room.language, code=body.code)
        await _log_run(room_id, profile.role.value, 0, 0)
        return RunResult(passed=0, total=0, results=[], stdout=out["stdout"], stderr=out["stderr"])

    results: list[TestResult] = []
    passed = 0
    for i, tc in enumerate(tests):
        out = await executor.run_code(
            language=room.language, code=body.code, stdin=str(tc.get("stdin", ""))
        )
        ok = out["stdout"].strip() == str(tc.get("expected", "")).strip()
        passed += int(ok)
        hidden = bool(tc.get("hidden"))
        show = is_recruiter or not hidden
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
    await _log_run(room_id, profile.role.value, passed, len(tests))
    return RunResult(passed=passed, total=len(tests), results=results)


async def _log_run(room_id: uuid.UUID, actor: str, passed: int, total: int) -> None:
    payload = {"passed": passed, "total": total}
    await telemetry.record_event(
        room_id=str(room_id), actor=actor, event_type="code_run", payload=payload
    )
    await publish(room_channel(str(room_id)), {"type": "code_run", "payload": payload})


@router.get("/{room_id}/events", response_model=list[EventOut])
async def list_room_events(
    room_id: uuid.UUID,
    recruiter: Annotated[Profile, Depends(require_role(Role.recruiter))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Event]:
    """Chronological event log for the recruiter's replay timeline."""
    await _require_participant(room_id, recruiter, session)
    rows = await session.scalars(
        select(Event).where(Event.room_id == room_id).order_by(Event.created_at)
    )
    return list(rows)
