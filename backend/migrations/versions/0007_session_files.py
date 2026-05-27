"""multi-file projects per session

Revision ID: 0007_session_files
Revises: 0006_multi_features
Create Date: 2026-05-27

Replaces the single `starting_code` text blob with a real file tree. The interviewer's wizard
can upload (drag-drop) any number of files, organize them into folders, and the candidate sees
the same tree in their IDE. `starting_code` is kept (legacy back-compat / read fallback for old
sessions) but new sessions will populate `session_files` instead.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_session_files"
down_revision: str | None = "0006_multi_features"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_files",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "is_folder", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("session_id", "path", name="uq_session_file_path"),
    )


def downgrade() -> None:
    op.drop_table("session_files")
