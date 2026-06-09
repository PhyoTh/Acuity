"""hallucination type selector

Revision ID: 0008_hallucination_type
Revises: 0007_session_files
Create Date: 2026-06-09

Adds `interview_sessions.hallucination_type` so the interviewer can pick which kind of flaw the
hallucination injector introduces (logic error, wrong API, edge case, inefficiency, security)
rather than only its probability. Existing rows default to "mixed", which is the original
any-subtle-flaw behavior.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_hallucination_type"
down_revision: str | None = "0007_session_files"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "hallucination_type",
            sa.String(length=40),
            nullable=False,
            server_default="mixed",
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "hallucination_type")
