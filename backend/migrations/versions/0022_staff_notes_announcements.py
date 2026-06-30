"""create staff_notes and announcements tables

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("app.tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_username", sa.String(64), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="app",
    )
    op.create_index("ix_staff_notes_tenant_id", "staff_notes", ["tenant_id"], schema="app")

    op.create_table(
        "announcements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("TRUE")),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("announcements", schema="app")
    op.drop_index("ix_staff_notes_tenant_id", table_name="staff_notes", schema="app")
    op.drop_table("staff_notes", schema="app")
