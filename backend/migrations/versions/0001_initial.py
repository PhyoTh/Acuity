"""initial schema — profiles, interview_rooms, room_participants, events, transcripts, scorecards

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-24

Hand-written (autogenerate needs a live DB). Mirrors app/db/models.py.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

role_enum = postgresql.ENUM("candidate", "recruiter", name="role", create_type=False)
room_status_enum = postgresql.ENUM(
    "pending", "active", "ended", name="room_status", create_type=False
)
transcript_role_enum = postgresql.ENUM(
    "user", "assistant", name="transcript_role", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    role_enum.create(bind, checkfirst=True)
    room_status_enum.create(bind, checkfirst=True)
    transcript_role_enum.create(bind, checkfirst=True)

    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("role", role_enum, nullable=False),
        sa.Column("display_name", sa.String(length=255)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "interview_rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("join_code", sa.String(length=12), nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "title", sa.String(length=255), nullable=False, server_default="Untitled interview"
        ),
        sa.Column("language", sa.String(length=40), nullable=False, server_default="python"),
        sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column("starting_code", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "guardrail_preset", sa.String(length=40), nullable=False, server_default="hints_only"
        ),
        sa.Column("guardrail_custom", sa.Text(), nullable=False, server_default=""),
        sa.Column("hallucination_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", room_status_enum, nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_interview_rooms_join_code", "interview_rooms", ["join_code"], unique=True)

    op.create_table(
        "room_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", role_enum, nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("room_id", "profile_id", name="uq_room_profile"),
    )
    op.create_index("ix_room_participants_room_id", "room_participants", ["room_id"])

    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor", sa.String(length=40), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_events_room_id", "events", ["room_id"])
    op.create_index("ix_events_created_at", "events", ["created_at"])

    op.create_table(
        "transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", transcript_role_enum, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "was_hallucinated", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("tokens", sa.Integer()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_transcripts_room_id", "transcripts", ["room_id"])
    op.create_index("ix_transcripts_created_at", "transcripts", ["created_at"])

    op.create_table(
        "scorecards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_rooms.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("overall", sa.Float()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_table("scorecards")
    op.drop_index("ix_transcripts_created_at", table_name="transcripts")
    op.drop_index("ix_transcripts_room_id", table_name="transcripts")
    op.drop_table("transcripts")
    op.drop_index("ix_events_created_at", table_name="events")
    op.drop_index("ix_events_room_id", table_name="events")
    op.drop_table("events")
    op.drop_index("ix_room_participants_room_id", table_name="room_participants")
    op.drop_table("room_participants")
    op.drop_index("ix_interview_rooms_join_code", table_name="interview_rooms")
    op.drop_table("interview_rooms")
    op.drop_table("profiles")
    transcript_role_enum.drop(bind, checkfirst=True)
    room_status_enum.drop(bind, checkfirst=True)
    role_enum.drop(bind, checkfirst=True)
