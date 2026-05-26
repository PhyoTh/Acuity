"""WebSocket router — the real-time sync gateway.

`WS /ws/rooms/{room_id}?token=<supabase_jwt>`:
  - authenticates via the Supabase JWT, verifies the caller is a room participant,
  - bridges the socket to the Redis `room:{id}` channel (fan-out to the other party),
  - routes inbound events (plan.md §5): code_change / chat_message / interview_end.

On chat_message: agent -> hallucinator -> telemetry -> broadcast ai_response.
On interview_end (recruiter): mark ended -> scorecard -> broadcast scorecard_ready.

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
from app.db.models import InterviewRoom, Profile, RoomParticipant, RoomStatus, Transcript
from app.redis_client import get_redis, publish, room_channel, subscribe
from app.security import decode_token
from app.services import agent, hallucinator, pushback, scorecard, telemetry
from app.services.llm import build_guardrail_system

router = APIRouter(tags=["ws"])

_HISTORY_FETCH = 20


async def _load_history(room_id: uuid.UUID) -> list[tuple[str, str]]:
    async with SessionLocal() as session:
        rows = list(
            await session.scalars(
                select(Transcript)
                .where(Transcript.room_id == room_id)
                .order_by(Transcript.created_at.desc())
                .limit(_HISTORY_FETCH)
            )
        )
    rows.reverse()
    return [(t.role.value, t.content) for t in rows]


async def _pump_redis_to_ws(channel: str, websocket: WebSocket, is_recruiter: bool) -> None:
    """Forward room events to this socket. Candidates never receive push-back questions, and the
    hallucination flag is stripped from their AI responses."""
    async for message in subscribe(channel):
        mtype = message.get("type")
        if not is_recruiter:
            if mtype == "pushback":
                continue
            if mtype == "ai_response":
                payload = {
                    k: v for k, v in message.get("payload", {}).items() if k != "was_hallucinated"
                }
                message = {**message, "payload": payload}
        await websocket.send_json(message)


async def _end_interview(room_id: str, channel: str) -> None:
    async with SessionLocal() as session:
        room = await session.get(InterviewRoom, uuid.UUID(room_id))
        if room is not None and room.status != RoomStatus.ended:
            room.status = RoomStatus.ended
            room.ended_at = datetime.now(UTC)
            await session.commit()
    card = await scorecard.generate_scorecard(room_id=room_id)
    await publish(channel, {"type": "scorecard_ready", "payload": {"scorecard_id": card["id"]}})


@router.websocket("/ws/rooms/{room_id}")
async def room_ws(websocket: WebSocket, room_id: str) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        token_data = decode_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    # Verify the caller is a participant and capture the room's AI config.
    async with SessionLocal() as session:
        profile = await session.get(Profile, token_data.user_id)
        if profile is None:
            profile = Profile(
                id=token_data.user_id, role=token_data.role_hint, display_name=token_data.email
            )
            session.add(profile)
            await session.commit()
            await session.refresh(profile)

        try:
            room_uuid = uuid.UUID(room_id)
        except ValueError:
            await websocket.close(code=4404)
            return

        room = await session.get(InterviewRoom, room_uuid)
        if room is None:
            await websocket.close(code=4404)
            return
        participant = await session.scalar(
            select(RoomParticipant).where(
                RoomParticipant.room_id == room_uuid,
                RoomParticipant.profile_id == profile.id,
            )
        )
        if participant is None:
            await websocket.close(code=4403)
            return

        actor = profile.role.value  # "candidate" | "recruiter"
        is_recruiter = actor == "recruiter"
        profile_id = str(profile.id)
        room_cfg = {
            "language": room.language,
            "guardrail_preset": room.guardrail_preset,
            "guardrail_custom": room.guardrail_custom,
            "hallucination_pct": room.hallucination_pct,
            "query_quota": room.query_quota,
            "ai_max_tokens": room.ai_max_tokens,
            "enable_pushback": room.enable_pushback,
        }

    await websocket.accept()
    channel = room_channel(room_id)
    listener = asyncio.create_task(_pump_redis_to_ws(channel, websocket, is_recruiter))
    await publish(channel, {"type": "presence", "payload": {actor: True}})

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_client_message(msg, room_id, channel, actor, profile_id, room_cfg)
    except WebSocketDisconnect:
        pass
    finally:
        listener.cancel()
        await publish(channel, {"type": "presence", "payload": {actor: False}})


async def _handle_client_message(
    msg: dict[str, Any],
    room_id: str,
    channel: str,
    actor: str,
    profile_id: str,
    room_cfg: dict[str, Any],
) -> None:
    mtype = msg.get("type")
    payload = msg.get("payload", {}) or {}

    if mtype == "code_change":
        await publish(channel, {"type": "code_change", "payload": payload})
        telemetry.fire(
            telemetry.record_event(
                room_id=room_id, actor=actor, event_type="code_change", payload=payload
            )
        )
        return

    if mtype == "paste":
        if actor != "candidate":
            return
        info = {"length": int(payload.get("length", 0) or 0)}
        telemetry.fire(
            telemetry.record_event(
                room_id=room_id, actor=actor, event_type="paste_flag", payload=info
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

        # AI query quota (Redis): enforce per candidate per room when configured.
        quota = int(room_cfg.get("query_quota", 0) or 0)
        if quota > 0:
            key = f"quota:{room_id}:{profile_id}"
            used = int(await get_redis().incr(key))
            if used == 1:
                await get_redis().expire(key, 86400)
            blocked = used > quota
            await publish(
                channel,
                {
                    "type": "quota",
                    "payload": {
                        "used": used,
                        "quota": quota,
                        "remaining": max(quota - used, 0),
                        "blocked": blocked,
                    },
                },
            )
            if blocked:
                return

        code = str(payload.get("code", ""))
        # Mirror the candidate's message to the room (recruiter dashboard) + log it.
        await publish(channel, {"type": "chat_message", "payload": {"content": content}})
        await telemetry.record_transcript(room_id=room_id, role="user", content=content)

        history = await _load_history(uuid.UUID(room_id))
        system_prompt = build_guardrail_system(
            room_cfg["guardrail_preset"], room_cfg["guardrail_custom"]
        )
        reply = await agent.generate_reply(
            query=content,
            code=code,
            language=room_cfg["language"],
            system_prompt=system_prompt,
            history=history,
            max_tokens=room_cfg.get("ai_max_tokens"),
        )
        final, was_hallucinated = await hallucinator.maybe_inject(
            answer=reply, probability=int(room_cfg["hallucination_pct"])
        )
        await telemetry.record_transcript(
            room_id=room_id, role="assistant", content=final, was_hallucinated=was_hallucinated
        )
        await publish(
            channel,
            {
                "type": "ai_response",
                "payload": {"content": final, "was_hallucinated": was_hallucinated},
            },
        )

        if room_cfg.get("enable_pushback"):
            convo = [*history, ("user", content), ("assistant", final)]
            telemetry.fire(_emit_pushback(room_id, channel, code, convo))
        return

    if mtype == "interview_end":
        if actor != "recruiter":
            return
        await _end_interview(room_id, channel)
        return


async def _emit_pushback(
    room_id: str, channel: str, code: str, transcript: list[tuple[str, str]]
) -> None:
    try:
        questions = await pushback.generate(code=code, transcript=transcript)
    except Exception:
        return
    if questions:
        await publish(channel, {"type": "pushback", "payload": {"questions": questions}})
