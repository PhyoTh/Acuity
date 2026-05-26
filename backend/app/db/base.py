"""Async SQLAlchemy engine + session boilerplate.

Provides the async engine, a session factory, and a FastAPI dependency. Models live in
`app.db.models`; migrations are managed by Alembic (see ../migrations).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with SessionLocal() as session:
        yield session
