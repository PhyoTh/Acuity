"""Telemetry logger.

Inputs : code diffs, chat transcripts, evaluation flags.
Output : rows appended to Postgres (`events`, `transcripts`).
Effect : records the interview flow WITHOUT blocking the WebSocket loop.

`fire()` schedules a write as a background task so high-frequency events (code changes) never
block the socket. Each writer opens its own short-lived async session.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Coroutine
from typing import Any

from app.db.base import SessionLocal
from app.db.models import Event, Transcript, TranscriptRole

# Keep strong refs to background tasks so they aren't garbage-collected mid-flight.
_background: set[asyncio.Task[Any]] = set()


def fire(coro: Coroutine[Any, Any, Any]) -> None:
    """Schedule a coroutine as a tracked background task (non-blocking)."""
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


async def record_event(
    *, session_id: str, actor: str, event_type: str, payload: dict[str, Any]
) -> None:
    async with SessionLocal() as db:
        db.add(
            Event(
                session_id=uuid.UUID(session_id), actor=actor, type=event_type, payload=payload
            )
        )
        await db.commit()


async def record_transcript(
    *,
    session_id: str,
    role: str,
    content: str,
    was_hallucinated: bool = False,
    tokens: int | None = None,
) -> None:
    async with SessionLocal() as db:
        db.add(
            Transcript(
                session_id=uuid.UUID(session_id),
                role=TranscriptRole(role),
                content=content,
                was_hallucinated=was_hallucinated,
                tokens=tokens,
            )
        )
        await db.commit()
