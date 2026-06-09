"""Async Redis client + pub/sub helpers for the real-time sync gateway.

Channel convention: `session:{id}`. The WS gateway publishes every session event here
so that all connected sockets for that session (candidate IDE + interviewer dashboard) receive it.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as redis

from app.config import get_settings

_settings = get_settings()
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Return the process-wide async Redis client (lazily created)."""
    global _client
    if _client is None:
        _client = redis.from_url(_settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Dispose the Redis client (called on app shutdown)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def session_channel(session_id: str) -> str:
    return f"session:{session_id}"


async def publish(channel: str, message: dict[str, Any]) -> None:
    """Publish a JSON-serializable message to a channel."""
    await get_redis().publish(channel, json.dumps(message))


async def subscribe(channel: str) -> AsyncIterator[dict[str, Any]]:
    """Async-iterate decoded JSON messages published to `channel`."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)
    try:
        async for raw in pubsub.listen():
            if raw.get("type") == "message":
                yield json.loads(raw["data"])
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()  # type: ignore[no-untyped-call]
