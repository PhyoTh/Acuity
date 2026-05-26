"""d2 room config — test_cases, query_quota, ai_max_tokens, enable_pushback

Revision ID: 0002_d2_config
Revises: 0001_initial
Create Date: 2026-05-25

Adds Deliverable 2 room configuration columns. Hand-written (mirrors app/db/models.py).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_d2_config"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_rooms",
        sa.Column(
            "test_cases",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "interview_rooms",
        sa.Column("query_quota", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("interview_rooms", sa.Column("ai_max_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "interview_rooms",
        sa.Column(
            "enable_pushback", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_rooms", "enable_pushback")
    op.drop_column("interview_rooms", "ai_max_tokens")
    op.drop_column("interview_rooms", "query_quota")
    op.drop_column("interview_rooms", "test_cases")
