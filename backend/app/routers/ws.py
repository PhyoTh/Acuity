"""WebSocket router — the real-time sync gateway.

`WS /ws/sessions/{session_id}?token=<supabase_jwt>`:
  - authenticates via the Supabase JWT, verifies the caller is a session participant,
  - bridges the socket to the Redis `session:{id}` channel (fan-out to the other party),
  - routes inbound events (plan.md §5): code_change / chat_message / interview_end.

On chat_message: budget check -> agent -> hallucinator -> telemetry -> broadcast ai_response,
then INCRBY the session's Redis token counter with the call's usage and emit a `token_budget`
state event so both sides can render remaining.

On interview_end (interviewer): mark ended -> scorecard -> broadcast scorecard_ready.

The candidate never receives the `was_hallucinated` flag (stripped per-socket below).
All work is async; high-frequency writes go through telemetry.fire (non-blocking).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import (
    InterviewSession,
    Profile,
    SessionParticipant,
    SessionStatus,
    Transcript,
)
from app.redis_client import get_redis, publish, session_channel, subscribe
from app.security import decode_token
from app.services import agent, hallucinator, pushback, scorecard, telemetry
from app.services.llm import build_guardrail_system

router = APIRouter(tags=["ws"])

_HISTORY_FETCH = 20


def _tokens_key(session_id: str) -> str:
    return f"tokens:{session_id}:total"


async def _tokens_used(session_id: str) -> int:
    raw = await get_redis().get(_tokens_key(session_id))
    return int(raw) if raw else 0


async def _broadcast_budget(channel: str, session_id: str, budget: int) -> None:
    """Publish a `token_budget` state event when a session has a non-zero budget configured."""
    if budget <= 0:
        return
    used = await _tokens_used(session_id)
    await publish(
        channel,
        {
            "type": "token_budget",
            "payload": {
                "used": used,
                "budget": budget,
                "remaining": max(budget - used, 0),
                "blocked": used >= budget,
            },
        },
    )


async def _load_history(session_id: uuid.UUID) -> list[tuple[str, str]]:
    async with SessionLocal() as db:
        rows = list(
            await db.scalars(
                select(Transcript)
                .where(Transcript.session_id == session_id)
                .order_by(Transcript.created_at.desc())
                .limit(_HISTORY_FETCH)
            )
        )
    rows.reverse()
    return [(t.role.value, t.content) for t in rows]


async def _pump_redis_to_ws(channel: str, websocket: WebSocket, is_interviewer: bool) -> None:
    """Forward session events to this socket. Candidates never receive push-back questions, and the
    hallucination flag is stripped from their AI responses."""
    async for message in subscribe(channel):
        mtype = message.get("type")
        if not is_interviewer:
            if mtype == "pushback":
                continue
            if mtype == "ai_response":
                payload = {
                    k: v for k, v in message.get("payload", {}).items() if k != "was_hallucinated"
                }
                message = {**message, "payload": payload}
        await websocket.send_json(message)


async def _end_interview(session_id: str, channel: str) -> None:
    async with SessionLocal() as db:
        interview = await db.get(InterviewSession, uuid.UUID(session_id))
        if interview is not None and interview.status != SessionStatus.ended:
            interview.status = SessionStatus.ended
            interview.ended_at = datetime.now(UTC)
            await db.commit()
    card = await scorecard.generate_scorecard(session_id=session_id)
    await publish(channel, {"type": "scorecard_ready", "payload": {"scorecard_id": card["id"]}})


@router.websocket("/ws/sessions/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        token_data = decode_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    # Verify the caller is a participant and capture the session's AI config.
    async with SessionLocal() as db:
        profile = await db.get(Profile, token_data.user_id)
        if profile is None:
            profile = Profile(
                id=token_data.user_id, role=token_data.role_hint, display_name=token_data.email
            )
            db.add(profile)
            await db.commit()
            await db.refresh(profile)

        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            await websocket.close(code=4404)
            return

        interview = await db.get(InterviewSession, session_uuid)
        if interview is None:
            await websocket.close(code=4404)
            return
        participant = await db.scalar(
            select(SessionParticipant).where(
                SessionParticipant.session_id == session_uuid,
                SessionParticipant.profile_id == profile.id,
            )
        )
        if participant is None:
            await websocket.close(code=4403)
            return

        actor = profile.role.value  # "candidate" | "interviewer"
        is_interviewer = actor == "interviewer"
        profile_id = str(profile.id)
        session_cfg = {
            "language": interview.language,
            "guardrail_preset": interview.guardrail_preset,
            "guardrail_custom": interview.guardrail_custom,
            "hallucination_pct": interview.hallucination_pct,
            "token_budget": interview.token_budget,
            "enable_pushback": interview.enable_pushback,
        }

    await websocket.accept()
    channel = session_channel(session_id)
    listener = asyncio.create_task(_pump_redis_to_ws(channel, websocket, is_interviewer))
    await publish(channel, {"type": "presence", "payload": {actor: True}})
    # Replay the current budget state so both sides render immediately on connect.
    raw_budget = session_cfg.get("token_budget") or 0
    initial_budget = int(raw_budget) if isinstance(raw_budget, int) else 0
    await _broadcast_budget(channel, session_id, initial_budget)

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_client_message(msg, session_id, channel, actor, profile_id, session_cfg)
    except WebSocketDisconnect:
        pass
    finally:
        listener.cancel()
        await publish(channel, {"type": "presence", "payload": {actor: False}})


async def _handle_client_message(
    msg: dict[str, Any],
    session_id: str,
    channel: str,
    actor: str,
    profile_id: str,
    session_cfg: dict[str, Any],
) -> None:
    mtype = msg.get("type")
    payload = msg.get("payload", {}) or {}

    if mtype == "code_change":
        await publish(channel, {"type": "code_change", "payload": payload})
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="code_change", payload=payload
            )
        )
        return

    if mtype == "paste":
        if actor != "candidate":
            return
        info = {"length": int(payload.get("length", 0) or 0)}
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="paste_flag", payload=info
            )
        )
        await publish(channel, {"type": "paste_flag", "payload": info})
        return

    if mtype == "chat_message":
        if actor != "candidate":
            return
        content = str(payload.get("content", "")).strip()
        if not content:
            return

        # Session-wide AI token budget (input + output, summed across the whole interview).
        budget = int(session_cfg.get("token_budget", 0) or 0)
        if budget > 0:
            used = await _tokens_used(session_id)
            if used >= budget:
                await publish(
                    channel,
                    {
                        "type": "token_budget",
                        "payload": {
                            "used": used,
                            "budget": budget,
                            "remaining": 0,
                            "blocked": True,
                        },
                    },
                )
                return

        code = str(payload.get("code", ""))
        # Mirror the candidate's message to the session (interviewer dashboard) + log it.
        await publish(channel, {"type": "chat_message", "payload": {"content": content}})
        await telemetry.record_transcript(session_id=session_id, role="user", content=content)

        history = await _load_history(uuid.UUID(session_id))
        system_prompt = build_guardrail_system(
            session_cfg["guardrail_preset"], session_cfg["guardrail_custom"]
        )
        reply, used_tokens = await agent.generate_reply(
            query=content,
            code=code,
            language=session_cfg["language"],
            system_prompt=system_prompt,
            history=history,
        )
        final, was_hallucinated = await hallucinator.maybe_inject(
            answer=reply, probability=int(session_cfg["hallucination_pct"])
        )
        await telemetry.record_transcript(
            session_id=session_id,
            role="assistant",
            content=final,
            was_hallucinated=was_hallucinated,
            tokens=used_tokens,
        )
        # Accumulate into the budget counter BEFORE broadcasting the response so the next state
        # event reflects the call we just made.
        if budget > 0 and used_tokens > 0:
            r = get_redis()
            await r.incrby(_tokens_key(session_id), used_tokens)
            # Match the session's lifetime — long enough to cover any reasonable interview.
            await r.expire(_tokens_key(session_id), 86400)
        await publish(
            channel,
            {
                "type": "ai_response",
                "payload": {"content": final, "was_hallucinated": was_hallucinated},
            },
        )
        await _broadcast_budget(channel, session_id, budget)

        if session_cfg.get("enable_pushback"):
            convo = [*history, ("user", content), ("assistant", final)]
            telemetry.fire(_emit_pushback(session_id, channel, code, convo))
        return

    if mtype == "interview_end":
        if actor != "interviewer":
            return
        await _end_interview(session_id, channel)
        return


async def _emit_pushback(
    session_id: str, channel: str, code: str, transcript: list[tuple[str, str]]
) -> None:
    try:
        questions = await pushback.generate(code=code, transcript=transcript)
    except Exception:
        return
    if questions:
        await publish(channel, {"type": "pushback", "payload": {"questions": questions}})
