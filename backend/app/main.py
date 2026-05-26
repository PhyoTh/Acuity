"""DevLens FastAPI application factory.

Wires CORS, the routers, a /health check, and the DB engine + Redis pool lifecycle.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.base import engine
from app.redis_client import close_redis, get_redis
from app.routers import auth, interview, ws


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Warm the Redis client; the DB engine connects lazily per-session.
    get_redis()
    try:
        yield
    finally:
        await close_redis()
        await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="DevLens API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(interview.router)
    app.include_router(ws.router)
    return app


app = create_app()
