"""create app.deletion_requests and app.deletion_approvals

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deletion_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.users.id"), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("target_type IN ('user','ingestion_source')", name="ck_deletion_requests_target_type"),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','executed')", name="ck_deletion_requests_status"
        ),
        schema="app",
    )

    op.create_table(
        "deletion_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.deletion_requests.id"), nullable=False
        ),
        sa.Column("approver_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.users.id"), nullable=False),
        sa.Column("approver_role", sa.String(32), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("decision IN ('approve','reject')", name="ck_deletion_approvals_decision"),
        sa.UniqueConstraint("request_id", "approver_role", name="uq_deletion_approvals_request_role"),
        schema="app",
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON app.deletion_requests TO eye_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON app.deletion_approvals TO eye_app")


def downgrade() -> None:
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON app.deletion_approvals FROM eye_app")
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON app.deletion_requests FROM eye_app")
    op.drop_table("deletion_approvals", schema="app")
    op.drop_table("deletion_requests", schema="app")
