"""WebSocket router — the real-time sync gateway.

`WS /ws/sessions/{session_id}?token=<supabase_jwt>`:
  - authenticates via the Supabase JWT, verifies the caller is a session participant,
  - bridges the socket to the Redis `session:{id}` channel (fan-out to the other party),
  - routes inbound events (plan.md §5).

On chat_message: budget check -> agent -> hallucinator -> telemetry -> broadcast ai_response,
then INCRBY the session's Redis token counter with the call's usage and emit a `token_budget`
state event so both sides can render remaining.

On interview_end (interviewer): mark ended -> scorecard -> broadcast scorecard_ready.

Phase 3 waiting room: candidates start with `admitted=False`. The interviewer's dashboard shows
a participant list and can `admit` or `kick`. Until admitted, the candidate's `chat_message` /
`code_change` are dropped server-side; once admitted, the frontend transitions out of the waiting
screen.

The candidate never receives the `was_hallucinated` flag (stripped per-socket below).
All work is async; high-frequency writes go through telemetry.fire (non-blocking).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import delete, select

from app.db.base import SessionLocal
from app.db.models import (
    Event,
    InterviewSession,
    Profile,
    SessionFile,
    SessionParticipant,
    SessionStatus,
    Transcript,
)
from app.redis_client import get_redis, publish, session_channel, subscribe
from app.security import decode_token
from app.services import agent, hallucinator, pushback, scorecard, shell, telemetry
from app.services.llm import build_guardrail_system
from app.services.names import random_display_name

router = APIRouter(tags=["ws"])

_HISTORY_FETCH = 20


def _tokens_key(session_id: str) -> str:
    return f"tokens:{session_id}:total"


def _connected_key(session_id: str) -> str:
    """Redis set of profile_ids currently holding an open WS to this session. Used so the
    participants payload can carry a `connected` flag — when the candidate closes their tab the
    interviewer's panel updates without waiting for a DB-level "left" state."""
    return f"connected:{session_id}"


async def _tokens_used(session_id: str) -> int:
    raw = await get_redis().get(_tokens_key(session_id))
    return int(raw) if raw else 0


async def _connected_profile_ids(session_id: str) -> set[str]:
    # redis-py async stubs make these methods read as `Awaitable[X] | X` because the same
    # class is used for sync+async. We're using `redis.asyncio` so the await is correct.
    raw = await get_redis().smembers(_connected_key(session_id))  # type: ignore[misc]
    return {(v.decode() if isinstance(v, bytes) else v) for v in raw}


async def _latest_code(session_id: uuid.UUID) -> dict[str, Any] | None:
    """Most recent `code_change` payload for this session (single-file mode). Lets rejoiners
    see the live buffer instead of the original starting_code. Multi-file projects already
    rehydrate from `session_files`, so this only matters when `hasFiles` is false."""
    async with SessionLocal() as db:
        row = await db.scalar(
            select(Event)
            .where(Event.session_id == session_id, Event.type == "code_change")
            .order_by(Event.created_at.desc())
            .limit(1)
        )
    if row is None:
        return None
    payload = row.payload or {}
    if not isinstance(payload, dict):
        return None
    # Defensive: only forward `code` + `language` — never echo back a `cursor` field that
    # would teleport the user's caret.
    return {k: payload[k] for k in ("code", "language") if k in payload}


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


async def _is_admitted(session_id: uuid.UUID, profile_id: uuid.UUID) -> bool:
    """Re-check the candidate's admit state from the DB. Cheap; called per inbound action."""
    async with SessionLocal() as db:
        row = await db.scalar(
            select(SessionParticipant.admitted).where(
                SessionParticipant.session_id == session_id,
                SessionParticipant.profile_id == profile_id,
            )
        )
    return bool(row)


async def _participants_payload(session_id: uuid.UUID) -> list[dict[str, Any]]:
    """List participants with names — fed to both sides for the dashboard's participant panel.

    Each row carries `connected: bool` — true iff a WebSocket is currently open from that
    profile. The frontend uses this to grey-out (or hide) participants who joined but later
    closed their tab; the canonical "is admitted" state still lives in the DB.
    """
    connected = await _connected_profile_ids(str(session_id))
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(
                    SessionParticipant.profile_id,
                    SessionParticipant.role,
                    SessionParticipant.admitted,
                    Profile.display_name,
                )
                .join(Profile, Profile.id == SessionParticipant.profile_id)
                .where(SessionParticipant.session_id == session_id)
                .order_by(SessionParticipant.joined_at)
            )
        ).all()
    return [
        {
            "profile_id": str(pid),
            "role": role.value,
            "admitted": bool(admitted),
            "display_name": name or "(unnamed)",
            "connected": str(pid) in connected,
        }
        for pid, role, admitted, name in rows
    ]


async def _broadcast_participants(channel: str, session_id: uuid.UUID) -> None:
    payload = await _participants_payload(session_id)
    await publish(channel, {"type": "participants", "payload": {"participants": payload}})


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
    """Two-phase end-interview: immediate broadcast so both sides leave the IDE without waiting
    on the scorecard LLM call; the scorecard is generated in the background and emits its own
    `scorecard_ready` event when finished."""
    ended_at: datetime | None = None
    async with SessionLocal() as db:
        interview = await db.get(InterviewSession, uuid.UUID(session_id))
        if interview is not None and interview.status != SessionStatus.ended:
            interview.status = SessionStatus.ended
            interview.ended_at = datetime.now(UTC)
            await db.commit()
            ended_at = interview.ended_at
        elif interview is not None:
            ended_at = interview.ended_at
    await publish(
        channel,
        {
            "type": "interview_ended",
            "payload": {"ended_at": ended_at.isoformat() if ended_at else None},
        },
    )
    telemetry.fire(_generate_scorecard_async(session_id, channel))


async def _run_shell(
    session_id: uuid.UUID, channel: str, command: str, single_file_code: str
) -> None:
    """Background runner for `shell_command`. Fetches the session's language + file tree from
    the DB, dispatches to `shell.execute`, and publishes the result. Multi-file sessions use
    the persisted tree; single-file sessions fall back to the code the candidate sent with
    the command (their live editor buffer)."""
    async with SessionLocal() as db:
        interview = await db.get(InterviewSession, session_id)
        if interview is None:
            return
        rows = list(
            await db.scalars(
                select(SessionFile).where(
                    SessionFile.session_id == session_id,
                    SessionFile.is_folder.is_(False),
                )
            )
        )
        language = interview.language
    files = {r.path: r.content for r in rows}
    try:
        out = await shell.execute(
            language=language,
            files=files,
            single_file_code=single_file_code,
            command=command,
        )
    except Exception as e:
        out = {"stdout": "", "stderr": f"shell error: {e}", "code": "1"}
    await publish(
        channel,
        {
            "type": "shell_output",
            "payload": {
                "command": command,
                "stdout": out.get("stdout", ""),
                "stderr": out.get("stderr", ""),
                "exit": out.get("code", ""),
            },
        },
    )


async def _generate_scorecard_async(session_id: str, channel: str) -> None:
    try:
        card = await scorecard.generate_scorecard(session_id=session_id)
    except Exception:
        # Scorecard generation failed; the summary view will keep showing its loading state.
        # Future: emit a `scorecard_failed` event so the UI can surface an error.
        return
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
                id=token_data.user_id,
                role=token_data.role_hint,
                display_name=random_display_name(),
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
            "guardrail_presets": list(interview.guardrail_presets or [interview.guardrail_preset]),
            "guardrail_custom": interview.guardrail_custom,
            "hallucination_pct": interview.hallucination_pct,
            "hallucination_type": interview.hallucination_type,
            "token_budget": interview.token_budget,
            "enable_pushback": interview.enable_pushback,
        }

    await websocket.accept()
    channel = session_channel(session_id)
    listener = asyncio.create_task(_pump_redis_to_ws(channel, websocket, is_interviewer))

    # Mark this profile as connected BEFORE building the participants snapshot so the
    # client sees its own `connected: true` row immediately. Using a Redis SET keeps this
    # idempotent — a candidate who briefly reconnects in a new tab won't be double-counted.
    await get_redis().sadd(_connected_key(session_id), profile_id)  # type: ignore[misc]

    # Direct snapshot to this socket — does NOT go through Redis pub/sub. Sending via publish has
    # a race: `pubsub.subscribe()` is async and the listener task may not be subscribed yet when
    # the publish fires, so the connecting socket misses its own snapshot. (This is the bug where
    # an interviewer joining a session AFTER the candidate had to refresh to see the join
    # request.) Direct send guarantees the new socket gets current state immediately on connect.
    raw_budget = session_cfg.get("token_budget") or 0
    initial_budget = int(raw_budget) if isinstance(raw_budget, int) else 0
    participants = await _participants_payload(session_uuid)
    await websocket.send_json({"type": "participants", "payload": {"participants": participants}})
    # Re-hydrate the candidate's editor with the latest code from the event log so a refresh
    # or accidental tab-close doesn't lose their work. Multi-file sessions already rehydrate
    # from `session_files`; this only fires for single-file mode.
    latest = await _latest_code(session_uuid)
    if latest is not None:
        await websocket.send_json({"type": "code_change", "payload": latest})
    if initial_budget > 0:
        used = await _tokens_used(session_id)
        await websocket.send_json(
            {
                "type": "token_budget",
                "payload": {
                    "used": used,
                    "budget": initial_budget,
                    "remaining": max(initial_budget - used, 0),
                    "blocked": used >= initial_budget,
                },
            }
        )

    # Broadcast to OTHER sockets so they refresh — e.g. the interviewer's participant panel
    # sees the candidate's join in real time without needing a manual refresh. Presence event
    # also notifies the other side that someone came online.
    await publish(channel, {"type": "presence", "payload": {actor: True}})
    await _broadcast_participants(channel, session_uuid)

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_client_message(
                msg, session_id, session_uuid, channel, actor, profile_id, session_cfg
            )
    except WebSocketDisconnect:
        pass
    finally:
        listener.cancel()
        # SREM + rebroadcast so the other side sees the candidate disappear in real time.
        # Without this the participants list still showed everyone who'd ever joined, even
        # after they closed their tab — see plan.md §7c notes.
        await get_redis().srem(_connected_key(session_id), profile_id)  # type: ignore[misc]
        await publish(channel, {"type": "presence", "payload": {actor: False}})
        await _broadcast_participants(channel, session_uuid)


async def _handle_client_message(
    msg: dict[str, Any],
    session_id: str,
    session_uuid: uuid.UUID,
    channel: str,
    actor: str,
    profile_id: str,
    session_cfg: dict[str, Any],
) -> None:
    mtype = msg.get("type")
    payload = msg.get("payload", {}) or {}

    if mtype == "code_change":
        if actor == "candidate" and not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
            return
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
        if not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
            return
        info = {"length": int(payload.get("length", 0) or 0)}
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="paste_flag", payload=info
            )
        )
        await publish(channel, {"type": "paste_flag", "payload": info})
        return

    if mtype == "tab_switch":
        # Candidate's tab visibility changed. We log every transition so the interviewer's UI
        # can render a running count + the replay scrubber can show where the candidate was
        # off-page. `hidden=True` means they left the interview tab.
        if actor != "candidate":
            return
        info = {"hidden": bool(payload.get("hidden", False))}
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="tab_switch", payload=info
            )
        )
        await publish(channel, {"type": "tab_switch", "payload": info})
        return

    if mtype == "cursor_move":
        # Throttled by the candidate (~10/s). We broadcast live (for the interviewer's cursor
        # ghost) and log a sampled subset for replay idle detection.
        if actor != "candidate":
            return
        if not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
            return
        info = {
            "line": int(payload.get("line", 1) or 1),
            "column": int(payload.get("column", 1) or 1),
        }
        await publish(channel, {"type": "cursor_move", "payload": info})
        # Log a coarser event for the replay timeline. Down-sampling is done client-side so we
        # don't write a row per keystroke.
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="cursor_move", payload=info
            )
        )
        return

    if mtype == "file_change":
        # Multi-file live edit. Payload: {path, content}. Authoritative copy lives in the DB
        # (CRUD via /sessions/{id}/files); this event keeps the interviewer's mirror in sync
        # between debounced PATCH saves.
        if actor == "candidate" and not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
            return
        file_info: dict[str, Any] = {
            "path": str(payload.get("path", "") or ""),
            "content": str(payload.get("content", "") or ""),
        }
        if not file_info["path"]:
            return
        await publish(channel, {"type": "file_change", "payload": file_info})
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id,
                actor=actor,
                event_type="file_change",
                # Don't log full file content into events.payload — just the path. We have the
                # latest content on disk via the files API; events stay small.
                payload={"path": file_info["path"]},
            )
        )
        return

    if mtype == "file_select":
        # Candidate switched the active file tab. Mirror on the interviewer side so their view
        # follows the candidate's attention. No DB write — purely UI state.
        if actor != "candidate":
            return
        select_path: str = str(payload.get("path", "") or "")
        if not select_path:
            return
        await publish(channel, {"type": "file_select", "payload": {"path": select_path}})
        return

    if mtype == "shell_command":
        # Candidate's interactive terminal. We log + fire the actual execution as a background
        # task so the inbound WS loop never blocks on Wandbox (the candidate can keep typing,
        # and slow runs don't hold up code_change broadcasts). The result is published as a
        # `shell_output` event so both the candidate and the interviewer see the same history.
        if actor == "candidate" and not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
            return
        cmd_text = str(payload.get("command", "")).strip()
        if not cmd_text:
            return
        single_file_code = str(payload.get("code", "") or "")
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id,
                actor=actor,
                event_type="shell_command",
                payload={"command": cmd_text},
            )
        )
        telemetry.fire(_run_shell(session_uuid, channel, cmd_text, single_file_code))
        return

    if mtype == "mouse_move":
        # Heartbeat used to compute idle gaps in the replay scrubber. NOT broadcast live —
        # the interviewer doesn't need to see every mouse jiggle in real time; it's purely
        # an activity marker logged to `events`. Sampled by the client to ~once per 2s.
        if actor != "candidate":
            return
        telemetry.fire(
            telemetry.record_event(
                session_id=session_id, actor=actor, event_type="mouse_move", payload={}
            )
        )
        return

    if mtype == "chat_message":
        if actor != "candidate":
            return
        if not await _is_admitted(session_uuid, uuid.UUID(profile_id)):
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

        history = await _load_history(session_uuid)
        system_prompt = build_guardrail_system(
            session_cfg.get("guardrail_presets") or session_cfg["guardrail_preset"],
            session_cfg["guardrail_custom"],
        )
        reply, used_tokens = await agent.generate_reply(
            query=content,
            code=code,
            language=session_cfg["language"],
            system_prompt=system_prompt,
            history=history,
        )
        final, was_hallucinated = await hallucinator.maybe_inject(
            answer=reply,
            probability=int(session_cfg["hallucination_pct"]),
            hallucination_type=str(session_cfg.get("hallucination_type") or "mixed"),
        )
        await telemetry.record_transcript(
            session_id=session_id,
            role="assistant",
            content=final,
            was_hallucinated=was_hallucinated,
            tokens=used_tokens,
        )
        if budget > 0 and used_tokens > 0:
            r = get_redis()
            await r.incrby(_tokens_key(session_id), used_tokens)
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

    if mtype == "admit":
        if actor != "interviewer":
            return
        target_raw = payload.get("profile_id")
        if not isinstance(target_raw, str):
            return
        try:
            target = uuid.UUID(target_raw)
        except ValueError:
            return
        async with SessionLocal() as db:
            row = await db.scalar(
                select(SessionParticipant).where(
                    SessionParticipant.session_id == session_uuid,
                    SessionParticipant.profile_id == target,
                )
            )
            if row is None or row.admitted:
                return
            row.admitted = True
            await db.commit()
        await _broadcast_participants(channel, session_uuid)
        return

    if mtype == "kick":
        if actor != "interviewer":
            return
        target_raw = payload.get("profile_id")
        if not isinstance(target_raw, str):
            return
        try:
            target = uuid.UUID(target_raw)
        except ValueError:
            return
        if target == uuid.UUID(profile_id):
            # Interviewers can't kick themselves.
            return
        async with SessionLocal() as db:
            await db.execute(
                delete(SessionParticipant).where(
                    SessionParticipant.session_id == session_uuid,
                    SessionParticipant.profile_id == target,
                )
            )
            await db.commit()
        # The targeted socket sees `kicked` with its own profile_id and closes; everyone else
        # uses the refreshed participant list.
        await publish(channel, {"type": "kicked", "payload": {"profile_id": str(target)}})
        await _broadcast_participants(channel, session_uuid)
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
