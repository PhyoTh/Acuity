"""optional co-interviewer invite code

Revision ID: 0009_interviewer_code
Revises: 0008_hallucination_type
Create Date: 2026-06-08

Adds a nullable, unique `interviewer_code` to `interview_sessions`. The candidate `join_code`
admits candidate accounts only; this second code admits interviewer accounts only — role is bound
to the link rather than the joiner's account, closing the gap where a second interviewer could open
the candidate link and bypass the waiting room. The code is minted on demand
(POST /sessions/{id}/cohost-link), so existing rows stay NULL until requested.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_interviewer_code"
down_revision: str | None = "0008_hallucination_type"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("interviewer_code", sa.String(length=12), nullable=True),
    )
    op.create_index(
        "ix_interview_sessions_interviewer_code",
        "interview_sessions",
        ["interviewer_code"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_interview_sessions_interviewer_code", table_name="interview_sessions")
    op.drop_column("interview_sessions", "interviewer_code")
