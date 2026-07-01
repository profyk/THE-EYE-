"""Add pending_deletion state to tenants

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("pending_deletion",        sa.Boolean(),             nullable=False, server_default="false"), schema="app")
    op.add_column("tenants", sa.Column("deletion_requested_at",   sa.DateTime(timezone=True), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("deletion_reason",         sa.Text(),                nullable=True), schema="app")


def downgrade() -> None:
    for col in ("deletion_reason", "deletion_requested_at", "pending_deletion"):
        op.drop_column("tenants", col, schema="app")
