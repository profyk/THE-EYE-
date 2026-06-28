"""create app.alert_acknowledgments

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_acknowledgments",
        sa.Column("alert_key", sa.String(64), primary_key=True),
        sa.Column("rule_id", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(256), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("acknowledged_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.users.id"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('acknowledged','escalated')", name="ck_alert_ack_status"),
        schema="app",
    )
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON app.alert_acknowledgments TO eye_app;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                REVOKE SELECT, INSERT, UPDATE, DELETE ON app.alert_acknowledgments FROM eye_app;
            END IF;
        END $$;
        """
    )
    op.drop_table("alert_acknowledgments", schema="app")
