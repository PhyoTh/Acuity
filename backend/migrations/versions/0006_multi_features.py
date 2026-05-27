"""multi-select guardrails + tab-switch/cursor/mouse-idle telemetry helpers

Revision ID: 0006_multi_features
Revises: 0005_waiting_room
Create Date: 2026-05-27

Adds:
- `interview_sessions.guardrail_presets` (JSONB list of strings). Multi-select guardrails — the
  interviewer can stack any number of presets. Backfilled from the legacy singular column so old
  rows keep working. The singular `guardrail_preset` column stays for backward compat.

No schema changes are required for the new telemetry event types (`tab_switch`, `cursor_move`,
`mouse_idle`) — they all flow into the existing `events.payload` JSONB with their own `type` tag.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0006_multi_features"
down_revision: str | None = "0005_waiting_room"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "guardrail_presets",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Backfill: copy the existing singular preset into the new array so behavior is preserved.
    op.execute(
        "UPDATE interview_sessions "
        "SET guardrail_presets = jsonb_build_array(guardrail_preset) "
        "WHERE guardrail_presets = '[]'::jsonb"
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "guardrail_presets")
