"""rename platform_admin role to super_admin

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update any existing platform_admin users (shouldn't be any yet, but safe).
    op.execute("UPDATE app.users SET role = 'super_admin' WHERE role = 'platform_admin'")

    # Replace the check constraint that references the old role name.
    op.drop_constraint("ck_users_tenant_required_unless_platform_admin", "users", schema="app", type_="check")
    op.create_check_constraint(
        "ck_users_tenant_required_unless_super_admin",
        "users",
        "tenant_id IS NOT NULL OR role = 'super_admin'",
        schema="app",
    )


def downgrade() -> None:
    op.execute("UPDATE app.users SET role = 'platform_admin' WHERE role = 'super_admin'")
    op.drop_constraint("ck_users_tenant_required_unless_super_admin", "users", schema="app", type_="check")
    op.create_check_constraint(
        "ck_users_tenant_required_unless_platform_admin",
        "users",
        "tenant_id IS NOT NULL OR role = 'platform_admin'",
        schema="app",
    )
