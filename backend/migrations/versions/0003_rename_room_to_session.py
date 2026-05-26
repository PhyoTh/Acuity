"""rename rooms->sessions, recruiter->interviewer

Revision ID: 0003_rename
Revises: 0002_d2_config
Create Date: 2026-05-26

Hand-written: renames tables, columns, and an enum value in place. Postgres 10+ supports
`ALTER TYPE ... RENAME VALUE` so existing rows keep their data without a copy.

  interview_rooms      -> interview_sessions
  room_participants    -> session_participants
  *.room_id            -> *.session_id     (events, transcripts, scorecards, session_participants)
  role 'recruiter'     -> 'interviewer'
  enum room_status     -> session_status
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_rename"
down_revision: str | None = "0002_d2_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enum value + type renames (Postgres 10+).
    op.execute("ALTER TYPE role RENAME VALUE 'recruiter' TO 'interviewer'")
    op.execute("ALTER TYPE room_status RENAME TO session_status")

    # Table renames.
    op.rename_table("interview_rooms", "interview_sessions")
    op.rename_table("room_participants", "session_participants")

    # Column renames. Renaming an indexed/FK'd column keeps the index + FK intact.
    op.alter_column("session_participants", "room_id", new_column_name="session_id")
    op.alter_column("events", "room_id", new_column_name="session_id")
    op.alter_column("transcripts", "room_id", new_column_name="session_id")
    op.alter_column("scorecards", "room_id", new_column_name="session_id")

    # Rename associated indexes and the unique constraint so names match the new columns.
    op.execute(
        "ALTER INDEX ix_interview_rooms_join_code RENAME TO ix_interview_sessions_join_code"
    )
    op.execute(
        "ALTER INDEX ix_room_participants_room_id "
        "RENAME TO ix_session_participants_session_id"
    )
    op.execute("ALTER INDEX ix_events_room_id RENAME TO ix_events_session_id")
    op.execute("ALTER INDEX ix_transcripts_room_id RENAME TO ix_transcripts_session_id")
    op.execute(
        "ALTER TABLE session_participants RENAME CONSTRAINT uq_room_profile TO uq_session_profile"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE session_participants RENAME CONSTRAINT uq_session_profile TO uq_room_profile"
    )
    op.execute("ALTER INDEX ix_transcripts_session_id RENAME TO ix_transcripts_room_id")
    op.execute("ALTER INDEX ix_events_session_id RENAME TO ix_events_room_id")
    op.execute(
        "ALTER INDEX ix_session_participants_session_id "
        "RENAME TO ix_room_participants_room_id"
    )
    op.execute(
        "ALTER INDEX ix_interview_sessions_join_code RENAME TO ix_interview_rooms_join_code"
    )

    op.alter_column("scorecards", "session_id", new_column_name="room_id")
    op.alter_column("transcripts", "session_id", new_column_name="room_id")
    op.alter_column("events", "session_id", new_column_name="room_id")
    op.alter_column("session_participants", "session_id", new_column_name="room_id")

    op.rename_table("session_participants", "room_participants")
    op.rename_table("interview_sessions", "interview_rooms")

    op.execute("ALTER TYPE session_status RENAME TO room_status")
    op.execute("ALTER TYPE role RENAME VALUE 'interviewer' TO 'recruiter'")
