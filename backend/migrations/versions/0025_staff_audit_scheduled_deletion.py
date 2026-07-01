"""Add scheduled_deletion_at to tenants; create staff_audit_logs table

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add scheduled deletion date to tenants
    op.add_column(
        "tenants",
        sa.Column("scheduled_deletion_at", sa.DateTime(timezone=True), nullable=True),
        schema="app",
    )

    # Create staff audit log table
    op.create_table(
        "staff_audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_username", sa.String(128), nullable=False),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=True),
        sa.Column("target_id", sa.String(256), nullable=True),
        sa.Column("target_name", sa.String(256), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("details", JSONB(), nullable=True),
        schema="app",
    )
    op.create_index("ix_staff_audit_logs_occurred_at", "staff_audit_logs", ["occurred_at"], schema="app")
    op.create_index("ix_staff_audit_logs_actor_id", "staff_audit_logs", ["actor_id"], schema="app")
    op.create_index("ix_staff_audit_logs_action", "staff_audit_logs", ["action"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_staff_audit_logs_action", "staff_audit_logs", schema="app")
    op.drop_index("ix_staff_audit_logs_actor_id", "staff_audit_logs", schema="app")
    op.drop_index("ix_staff_audit_logs_occurred_at", "staff_audit_logs", schema="app")
    op.drop_table("staff_audit_logs", schema="app")
    op.drop_column("tenants", "scheduled_deletion_at", schema="app")
