"""create api_keys table

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app.tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("key_prefix", sa.String(20), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        schema="app",
    )
    op.create_index("ix_api_keys_tenant_id", "api_keys", ["tenant_id"], schema="app")
    op.create_index(
        "ix_api_keys_key_hash", "api_keys", ["key_hash"], schema="app", unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_api_keys_key_hash", table_name="api_keys", schema="app")
    op.drop_index("ix_api_keys_tenant_id", table_name="api_keys", schema="app")
    op.drop_table("api_keys", schema="app")
