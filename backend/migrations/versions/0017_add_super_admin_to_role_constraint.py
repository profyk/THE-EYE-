"""add super_admin to ck_users_role check constraint

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALL_ROLES = (
    "'admin','investigator','chief_auditor','compliance_officer',"
    "'security_officer','executive_authority','super_admin'"
)
_OLD_ROLES = (
    "'admin','investigator','chief_auditor','compliance_officer',"
    "'security_officer','executive_authority'"
)


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", schema="app", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        f"role IN ({_ALL_ROLES})",
        schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role", "users", schema="app", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        f"role IN ({_OLD_ROLES})",
        schema="app",
    )
