"""create app.tenants, add tenant_id to users and deletion_requests

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Same fixed-zero-UUID convention as ledger_event.DEFAULT_TENANT_ID, so existing
# dev data (users, deletion requests, ledger events already stamped with that
# UUID) all line up under one real tenant row after this migration, instead of
# referencing a tenant_id that doesn't exist anywhere.
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="app",
    )
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                GRANT SELECT, INSERT, UPDATE ON app.tenants TO eye_app;
            END IF;
        END $$;
        """
    )

    op.execute(
        f"""
        INSERT INTO app.tenants (id, name, slug, is_active, created_at)
        VALUES ('{DEFAULT_TENANT_ID}', 'Default', 'default', true, now())
        """
    )

    op.add_column("users", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True), schema="app")
    op.create_foreign_key(
        "fk_users_tenant_id", "users", "tenants", ["tenant_id"], ["id"], source_schema="app", referent_schema="app"
    )
    op.execute(f"UPDATE app.users SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE role != 'platform_admin'")
    op.create_check_constraint(
        "ck_users_tenant_required_unless_platform_admin",
        "users",
        "tenant_id IS NOT NULL OR role = 'platform_admin'",
        schema="app",
    )

    op.add_column("deletion_requests", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True), schema="app")
    op.execute(f"UPDATE app.deletion_requests SET tenant_id = '{DEFAULT_TENANT_ID}'")
    op.alter_column("deletion_requests", "tenant_id", nullable=False, schema="app")
    op.create_foreign_key(
        "fk_deletion_requests_tenant_id",
        "deletion_requests",
        "tenants",
        ["tenant_id"],
        ["id"],
        source_schema="app",
        referent_schema="app",
    )

    # alert_key is a hash of rule_id:actor_id:bucket -- without tenant_id baked
    # into that hash, two tenants with an actor of the same name could collide
    # on the same key and one tenant's acknowledgment would silently apply to
    # the other's alert. Existing rows predate per-tenant alerting entirely,
    # so they're attributed to the bootstrap tenant (their keys will simply
    # never match a newly-computed tenant-aware key again, which is fine --
    # they just age out).
    op.add_column(
        "alert_acknowledgments", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True), schema="app"
    )
    op.execute(f"UPDATE app.alert_acknowledgments SET tenant_id = '{DEFAULT_TENANT_ID}'")
    op.alter_column("alert_acknowledgments", "tenant_id", nullable=False, schema="app")
    op.create_foreign_key(
        "fk_alert_acknowledgments_tenant_id",
        "alert_acknowledgments",
        "tenants",
        ["tenant_id"],
        ["id"],
        source_schema="app",
        referent_schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("fk_alert_acknowledgments_tenant_id", "alert_acknowledgments", schema="app", type_="foreignkey")
    op.drop_column("alert_acknowledgments", "tenant_id", schema="app")

    op.drop_constraint("fk_deletion_requests_tenant_id", "deletion_requests", schema="app", type_="foreignkey")
    op.drop_column("deletion_requests", "tenant_id", schema="app")

    op.drop_constraint("ck_users_tenant_required_unless_platform_admin", "users", schema="app", type_="check")
    op.drop_constraint("fk_users_tenant_id", "users", schema="app", type_="foreignkey")
    op.drop_column("users", "tenant_id", schema="app")

    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                REVOKE SELECT, INSERT, UPDATE ON app.tenants FROM eye_app;
            END IF;
        END $$;
        """
    )
    op.drop_table("tenants", schema="app")
