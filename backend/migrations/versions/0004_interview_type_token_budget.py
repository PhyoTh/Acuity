"""interview_type + token_budget; drop query_quota + ai_max_tokens

Revision ID: 0004_type_budget
Revises: 0003_rename
Create Date: 2026-05-26

Phase 2 of the redesign:
- Add `interview_type` (algorithm | api | debugging | code_review | refactor | sql | tdd |
  system_design). Stored as a plain VARCHAR for forward-compat; defaults are applied in the
  wizard UI and the type guides the AI configuration the interviewer picks.
- Replace the two old AI throttles (`query_quota` for messages, `ai_max_tokens` per reply) with
  a single session-wide `token_budget` counting input+output tokens combined across the whole
  conversation. 0 means unlimited.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_type_budget"
down_revision: str | None = "0003_rename"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "interview_type",
            sa.String(length=40),
            nullable=False,
            server_default="algorithm",
        ),
    )
    op.add_column(
        "interview_sessions",
        sa.Column(
            "token_budget", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.drop_column("interview_sessions", "query_quota")
    op.drop_column("interview_sessions", "ai_max_tokens")


def downgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("ai_max_tokens", sa.Integer(), nullable=True),
    )
    op.add_column(
        "interview_sessions",
        sa.Column("query_quota", sa.Integer(), nullable=False, server_default="0"),
    )
    op.drop_column("interview_sessions", "token_budget")
    op.drop_column("interview_sessions", "interview_type")
