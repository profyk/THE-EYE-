"""ensure check constraint allows super_admin role (idempotent fix)

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename any leftover platform_admin rows.
    op.execute("UPDATE app.users SET role = 'super_admin' WHERE role = 'platform_admin'")

    # Drop old constraint if it still exists (0015 may or may not have run).
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_schema = 'app'
                  AND table_name = 'users'
                  AND constraint_name = 'ck_users_tenant_required_unless_platform_admin'
            ) THEN
                ALTER TABLE app.users
                    DROP CONSTRAINT ck_users_tenant_required_unless_platform_admin;
            END IF;
        END $$
    """)

    # Drop new constraint if 0015 already created it (idempotent).
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_schema = 'app'
                  AND table_name = 'users'
                  AND constraint_name = 'ck_users_tenant_required_unless_super_admin'
            ) THEN
                ALTER TABLE app.users
                    DROP CONSTRAINT ck_users_tenant_required_unless_super_admin;
            END IF;
        END $$
    """)

    # Create the correct constraint.
    op.create_check_constraint(
        "ck_users_tenant_required_unless_super_admin",
        "users",
        "tenant_id IS NOT NULL OR role = 'super_admin'",
        schema="app",
    )


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_schema = 'app'
                  AND table_name = 'users'
                  AND constraint_name = 'ck_users_tenant_required_unless_super_admin'
            ) THEN
                ALTER TABLE app.users
                    DROP CONSTRAINT ck_users_tenant_required_unless_super_admin;
            END IF;
        END $$
    """)
    op.create_check_constraint(
        "ck_users_tenant_required_unless_platform_admin",
        "users",
        "tenant_id IS NOT NULL OR role = 'platform_admin'",
        schema="app",
    )
    op.execute("UPDATE app.users SET role = 'platform_admin' WHERE role = 'super_admin'")
