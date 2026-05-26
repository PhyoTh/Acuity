"""Pydantic request/response DTOs for the HTTP API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Role, SessionStatus

GUARDRAIL_PRESETS = ("hints_only", "no_full_solutions", "explain_dont_write", "open")


class TestCase(BaseModel):
    stdin: str = ""
    expected: str = ""
    hidden: bool = False


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: Role
    display_name: str | None
    created_at: datetime


class SessionCreate(BaseModel):
    title: str = Field(default="Untitled interview", max_length=255)
    language: str = Field(default="python", max_length=40)
    prompt: str = ""
    starting_code: str = ""
    guardrail_preset: str = Field(default="hints_only")
    guardrail_custom: str = ""
    hallucination_pct: int = Field(default=0, ge=0, le=100)
    test_cases: list[TestCase] = Field(default_factory=list)
    query_quota: int = Field(default=0, ge=0, le=1000)
    ai_max_tokens: int | None = Field(default=None, ge=64, le=8192)
    enable_pushback: bool = False


class SessionOut(BaseModel):
    """Full session view (interviewer/creator only — includes AI config)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    join_code: str
    created_by: uuid.UUID
    title: str
    language: str
    prompt: str
    starting_code: str
    guardrail_preset: str
    guardrail_custom: str
    hallucination_pct: int
    test_cases: list[TestCase]
    query_quota: int
    ai_max_tokens: int | None
    enable_pushback: bool
    status: SessionStatus
    created_at: datetime
    ended_at: datetime | None


class SessionCandidateView(BaseModel):
    """Limited session view for candidates — hides guardrails + hallucination settings."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    language: str
    prompt: str
    starting_code: str
    query_quota: int
    status: SessionStatus


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    join_code: str
    title: str
    language: str
    status: SessionStatus
    created_at: datetime


class JoinRequest(BaseModel):
    join_code: str = Field(min_length=1, max_length=12)


class JoinResult(BaseModel):
    session_id: uuid.UUID
    role: Role


class ScorecardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    scores: dict[str, float]
    summary: str
    overall: float | None
    created_at: datetime


class RunRequest(BaseModel):
    code: str


class TestResult(BaseModel):
    name: str
    passed: bool
    hidden: bool
    stdin: str | None = None
    expected: str | None = None
    actual: str | None = None
    stderr: str | None = None


class RunResult(BaseModel):
    passed: int
    total: int
    results: list[TestResult]
    stdout: str | None = None
    stderr: str | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str
    actor: str
    payload: dict[str, Any]
    created_at: datetime
