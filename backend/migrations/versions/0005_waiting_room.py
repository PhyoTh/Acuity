"""waiting room — session_participants.admitted

Revision ID: 0005_waiting_room
Revises: 0004_type_budget
Create Date: 2026-05-26

Phase 3: candidates joining via the invite link enter a waiting state until the interviewer
explicitly admits them. Interviewer rows are admitted from the moment they create the session.

Existing data (pre-Phase-3) is treated as already-admitted so that in-flight sessions don't
break — new joins are the only ones that start with `admitted=false`.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_waiting_room"
down_revision: str | None = "0004_type_budget"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Default-true backfills the existing rows; the application code sets admitted=False for
    # newly joining candidates explicitly. We could then drop the default, but keeping it lets
    # interviewer rows continue to default to admitted-on-create.
    op.add_column(
        "session_participants",
        sa.Column(
            "admitted", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )


def downgrade() -> None:
    op.drop_column("session_participants", "admitted")
