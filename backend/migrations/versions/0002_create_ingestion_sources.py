"""create app.ingestion_sources

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ingestion_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False,
                   server_default=sa.text("'00000000-0000-0000-0000-000000000000'")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_kind", sa.String(32), nullable=False),
        sa.Column("api_key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("api_key_prefix", sa.String(32), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "source_kind IN ('db_trigger','api_hook','log_forwarder','agent','manual')",
            name="ck_ingestion_sources_kind",
        ),
        schema="app",
    )
    op.create_index("ix_ingestion_sources_tenant", "ingestion_sources", ["tenant_id"], schema="app")

    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON app.ingestion_sources TO eye_app;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_ingestion_sources_tenant", table_name="ingestion_sources", schema="app")
    op.drop_table("ingestion_sources", schema="app")
