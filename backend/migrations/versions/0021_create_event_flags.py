"""create event_flags table

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_flags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("event_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "flagged_by",
            UUID(as_uuid=True),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("flagged_by_name", sa.String(256), nullable=True),
        sa.Column("flag_type", sa.String(32), nullable=False),  # suspicious|unlawful|evidence|cleared
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="app",
    )
    op.create_index("ix_event_flags_event_id", "event_flags", ["event_id"], schema="app")
    op.create_index("ix_event_flags_tenant_id", "event_flags", ["tenant_id"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_event_flags_tenant_id", table_name="event_flags", schema="app")
    op.drop_index("ix_event_flags_event_id", table_name="event_flags", schema="app")
    op.drop_table("event_flags", schema="app")
