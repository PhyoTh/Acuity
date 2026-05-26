"""Pydantic request/response DTOs for the HTTP API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Role, SessionStatus

GUARDRAIL_PRESETS = (
    "hints_only",
    "no_full_solutions",
    "explain_dont_write",
    "syntax_only",
    "open",
)

# Interview kinds the wizard offers. The wizard pre-fills the AI behavior step from these defaults;
# the interviewer can still override anything before saving. Frontend mirrors this list in
# lib/types.ts so the UI cards stay in sync.
INTERVIEW_TYPES: dict[str, dict[str, Any]] = {
    "algorithm": {
        "label": "Algorithm / LeetCode",
        "guardrail_preset": "syntax_only",
        "hallucination_pct": 0,
        "token_budget": 4000,
    },
    "api": {
        "label": "API integration",
        "guardrail_preset": "hints_only",
        "hallucination_pct": 0,
        "token_budget": 12000,
    },
    "debugging": {
        "label": "Debugging",
        "guardrail_preset": "explain_dont_write",
        "hallucination_pct": 30,
        "token_budget": 6000,
    },
    "code_review": {
        "label": "Code review",
        "guardrail_preset": "open",
        "hallucination_pct": 0,
        "token_budget": 4000,
    },
    "refactor": {
        "label": "Refactor / optimize",
        "guardrail_preset": "hints_only",
        "hallucination_pct": 0,
        "token_budget": 6000,
    },
    "sql": {
        "label": "SQL / data query",
        "guardrail_preset": "syntax_only",
        "hallucination_pct": 0,
        "token_budget": 3000,
    },
    "tdd": {
        "label": "Test writing (TDD)",
        "guardrail_preset": "explain_dont_write",
        "hallucination_pct": 0,
        "token_budget": 4000,
    },
    "system_design": {
        "label": "System design",
        "guardrail_preset": "open",
        "hallucination_pct": 0,
        "token_budget": 20000,
    },
}


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
    interview_type: str = Field(default="algorithm", max_length=40)
    prompt: str = ""
    starting_code: str = ""
    guardrail_preset: str = Field(default="hints_only")
    guardrail_custom: str = ""
    hallucination_pct: int = Field(default=0, ge=0, le=100)
    test_cases: list[TestCase] = Field(default_factory=list)
    token_budget: int = Field(default=0, ge=0, le=200000)
    enable_pushback: bool = False


class SessionOut(BaseModel):
    """Full session view (interviewer/creator only — includes AI config)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    join_code: str
    created_by: uuid.UUID
    title: str
    language: str
    interview_type: str
    prompt: str
    starting_code: str
    guardrail_preset: str
    guardrail_custom: str
    hallucination_pct: int
    test_cases: list[TestCase]
    token_budget: int
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
    interview_type: str
    prompt: str
    starting_code: str
    token_budget: int
    status: SessionStatus


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    join_code: str
    title: str
    language: str
    interview_type: str
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
