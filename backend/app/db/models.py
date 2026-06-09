"""SQLAlchemy models for Acuity.

All tables live in the Supabase Postgres alongside Supabase's `auth` schema. We do NOT FK into
`auth.users` (it's in a separate schema we don't own); instead `profiles.id` *equals* the auth
user's UUID and everything else references `profiles`. Schema changes go through Alembic
(see ../migrations); the first migration (0001_initial) mirrors this file.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all Acuity ORM models."""


class Role(enum.StrEnum):
    candidate = "candidate"
    interviewer = "interviewer"


class SessionStatus(enum.StrEnum):
    pending = "pending"
    active = "active"
    ended = "ended"


class TranscriptRole(enum.StrEnum):
    user = "user"
    assistant = "assistant"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Profile(Base):
    """App-side user record; `id` equals the Supabase auth user UUID."""

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class InterviewSession(Base):
    """One interview session and its interviewer-defined configuration."""

    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    join_code: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )

    # Problem config
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Untitled interview")
    language: Mapped[str] = mapped_column(String(40), nullable=False, default="python")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    starting_code: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Interview kind drives the wizard's recommended AI defaults; see schemas.INTERVIEW_TYPES.
    interview_type: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default="algorithm", default="algorithm"
    )

    # AI config
    guardrail_preset: Mapped[str] = mapped_column(String(40), nullable=False, default="hints_only")
    # Multi-select guardrails: the interviewer can stack any number of presets. `guardrail_preset`
    # (singular) is retained for backward compat — it always equals `guardrail_presets[0]` when
    # `guardrail_presets` has at least one entry.
    guardrail_presets: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list
    )
    guardrail_custom: Mapped[str] = mapped_column(Text, nullable=False, default="")
    hallucination_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Which kind of flaw the injector introduces when a roll hits (see services.hallucinator
    # HALLUCINATION_TYPES). "mixed" preserves the original any-subtle-flaw behavior.
    hallucination_type: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default="mixed", default="mixed"
    )

    # test_cases: list of {stdin, expected, hidden} run by the code-execution sandbox
    test_cases: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list
    )
    # Session-wide AI throttle: cap on (input + output) tokens summed across the whole interview.
    # 0 = unlimited. Counted in Redis (`tokens:{session_id}:total`) from response.usage_metadata.
    token_budget: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    enable_pushback: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )

    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"), nullable=False, default=SessionStatus.pending
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    participants: Mapped[list[SessionParticipant]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class SessionParticipant(Base):
    """Who is in a session and as what role (interviewer = creator; candidate = joined by code).

    `admitted` gates the candidate's waiting-room experience: they connect over WS in a waiting
    state, the interviewer reviews the participant list, and clicks Admit (or Kick) to let them
    into the live interview.
    """

    __tablename__ = "session_participants"
    __table_args__ = (UniqueConstraint("session_id", "profile_id", name="uq_session_profile"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"), nullable=False)
    admitted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped[InterviewSession] = relationship(back_populates="participants")


class Event(Base):
    """Append-only telemetry (code diffs, presence, flags). `payload` is arbitrary jsonb."""

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor: Mapped[str] = mapped_column(String(40), nullable=False)  # candidate|interviewer|system
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Transcript(Base):
    """Chat turns between the candidate and the AI assistant."""

    __tablename__ = "transcripts"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[TranscriptRole] = mapped_column(
        Enum(TranscriptRole, name="transcript_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    was_hallucinated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class SessionFile(Base):
    """One file (or folder) in a session's project tree.

    Multi-file support: the interviewer's create-session wizard uploads a tree of files; the
    candidate sees the same tree in their IDE and can add/rename/delete/edit. Folders are
    represented as rows with `is_folder=True` and empty `content`. `path` is a forward-slash
    relative path from the project root (e.g. "src/utils/math.py"). Uniqueness on
    (session_id, path) makes rename safe and lookups cheap.
    """

    __tablename__ = "session_files"
    __table_args__ = (UniqueConstraint("session_id", "path", name="uq_session_file_path"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_folder: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Scorecard(Base):
    """Final LLM evaluation for a session (one per session)."""

    __tablename__ = "scorecards"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    # scores: {prompt_quality, caught_ai_errors, code_correctness, approach_independence} -> 0..10
    scores: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    overall: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
