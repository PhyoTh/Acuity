"""Pydantic request/response DTOs for the HTTP API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Role, SessionStatus
from app.services.hallucinator import HALLUCINATION_TYPES as _HALLUCINATION_TYPE_DEFS

GUARDRAIL_PRESETS = (
    "hints_only",
    "no_full_solutions",
    "explain_dont_write",
    "syntax_only",
    "open",
)

# Allowed hallucination_type keys — sourced from the injector so the two never drift.
HALLUCINATION_TYPES = tuple(_HALLUCINATION_TYPE_DEFS)

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
        "hallucination_type": "logic_error",
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
    """One executable test.

    Two modes are supported:
    - **stdin** mode (default): the candidate's program is run as-is; `stdin` is piped to it and
      stdout is compared against `expected`. Suitable for I/O problems (read input, print answer).
    - **call** mode: when `call` is non-empty, the runner appends a small harness that evaluates
      that expression (after the candidate's code) and prints its result. This is what makes
      LeetCode-style problems work — the candidate pastes a `class Solution: def twoSum(...)`
      and the test sets `call="Solution().twoSum([2,7,11,15], 9)"` + `expected="[0, 1]"`.
    """

    stdin: str = ""
    expected: str = ""
    hidden: bool = False
    call: str = ""


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: Role
    display_name: str | None
    created_at: datetime


class ProfileUpdate(BaseModel):
    """Patch payload for `PATCH /auth/me`. Only the display name is editable so far."""

    display_name: str = Field(min_length=1, max_length=255)


class CandidateSessionLog(BaseModel):
    """Privacy-stripped session row for the candidate dashboard.

    The candidate dashboard is a log; it intentionally omits the problem statement, code,
    transcripts, scorecard, language, join code, and interviewer identity. Only the kind of
    interview, its status, and when it happened.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    interview_type: str
    status: SessionStatus
    created_at: datetime
    ended_at: datetime | None


class TranscriptOut(BaseModel):
    """One chat turn — interviewer-only (includes the `was_hallucinated` flag)."""

    model_config = ConfigDict(from_attributes=True)

    role: str
    content: str
    was_hallucinated: bool
    created_at: datetime


class SessionCreate(BaseModel):
    title: str = Field(default="Untitled interview", max_length=255)
    language: str = Field(default="python", max_length=40)
    interview_type: str = Field(default="algorithm", max_length=40)
    prompt: str = ""
    starting_code: str = ""
    # Singular `guardrail_preset` is kept for backward compat with existing clients; new clients
    # should send `guardrail_presets` (a list) and the server stacks them. If only the singular
    # one is sent, the server normalizes to a single-element list.
    guardrail_preset: str = Field(default="hints_only")
    guardrail_presets: list[str] = Field(default_factory=list)
    guardrail_custom: str = ""
    hallucination_pct: int = Field(default=0, ge=0, le=100)
    hallucination_type: str = Field(default="mixed", max_length=40)
    test_cases: list[TestCase] = Field(default_factory=list)
    token_budget: int = Field(default=0, ge=0, le=200000)
    enable_pushback: bool = False


class SessionOut(BaseModel):
    """Full session view (interviewer/creator only — includes AI config)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    join_code: str
    interviewer_code: str | None = None
    created_by: uuid.UUID
    title: str
    language: str
    interview_type: str
    prompt: str
    starting_code: str
    guardrail_preset: str
    guardrail_presets: list[str] = Field(default_factory=list)
    guardrail_custom: str
    hallucination_pct: int
    hallucination_type: str
    test_cases: list[TestCase]
    token_budget: int
    enable_pushback: bool
    status: SessionStatus
    created_at: datetime
    ended_at: datetime | None
    # Model the AI assistant is using right now (server-wide env). Surfaced in the chat header
    # so both interviewer + candidate know which Claude is talking to them.
    ai_model: str = ""


class SessionCandidateView(BaseModel):
    """Limited session view for candidates. Guardrail preset + hallucination % are shown so
    the candidate isn't blind-sided by AI behavior (the *exact* guardrail text and
    interviewer-only custom override remain hidden)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    language: str
    interview_type: str
    prompt: str
    starting_code: str
    token_budget: int
    status: SessionStatus
    guardrail_preset: str = ""
    guardrail_presets: list[str] = Field(default_factory=list)
    # Whether the interviewer set a free-text custom guardrail. The candidate is told *that*
    # extra rules apply (so the AI's behavior isn't surprising) but never the text itself, which
    # may contain interviewer-only steering notes.
    has_custom_guardrail: bool = False
    hallucination_pct: int = 0
    hallucination_type: str = "mixed"
    ai_model: str = ""


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


class CohostLinkOut(BaseModel):
    """The interviewer-only co-host invite code for a session."""

    interviewer_code: str


class ScorecardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    scores: dict[str, float]
    summary: str
    overall: float | None
    created_at: datetime


class SessionFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    path: str
    content: str
    is_folder: bool
    updated_at: datetime


class SessionFileCreate(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    content: str = ""
    is_folder: bool = False


class SessionFileUpdate(BaseModel):
    # PATCH payload: any subset can be sent. `path` triggers a rename.
    path: str | None = Field(default=None, max_length=512)
    content: str | None = None


class RunRequest(BaseModel):
    # Legacy single-file mode: when the session has no files in `session_files`, the candidate
    # sends their working code here and we run that. With files, the server runs the file tree
    # and ignores this field.
    code: str = ""


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
