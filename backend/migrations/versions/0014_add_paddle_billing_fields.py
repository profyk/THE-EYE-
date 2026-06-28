"""add paddle billing fields to tenants

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("paddle_customer_id", sa.String(255), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("paddle_subscription_id", sa.String(255), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("paddle_subscription_status", sa.String(64), nullable=True), schema="app")
    op.create_index(
        "ix_tenants_paddle_subscription_id", "tenants", ["paddle_subscription_id"],
        unique=True, schema="app",
        postgresql_where=sa.text("paddle_subscription_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_paddle_subscription_id", table_name="tenants", schema="app")
    op.drop_column("tenants", "paddle_subscription_status", schema="app")
    op.drop_column("tenants", "paddle_subscription_id", schema="app")
    op.drop_column("tenants", "paddle_customer_id", schema="app")
