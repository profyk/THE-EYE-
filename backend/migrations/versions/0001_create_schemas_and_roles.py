"""create schemas and roles

Revision ID: 0001
Revises:
Create Date: 2026-06-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS ledger")
    op.execute("CREATE SCHEMA IF NOT EXISTS app")

    # Restricted runtime role the FastAPI app connects as. Real credentials come
    # from the DATABASE_URL env var / infra secrets manager in real deployments;
    # this default password is for local dev only and must be rotated before any
    # non-local use.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                CREATE ROLE eye_app LOGIN PASSWORD 'eye_app_devpassword';
            END IF;
        END $$;
        """
    )

    op.execute("GRANT USAGE ON SCHEMA ledger TO eye_app")
    op.execute("GRANT USAGE ON SCHEMA app TO eye_app")


def downgrade() -> None:
    op.execute("REVOKE USAGE ON SCHEMA app FROM eye_app")
    op.execute("REVOKE USAGE ON SCHEMA ledger FROM eye_app")
    op.execute("DROP SCHEMA IF EXISTS app CASCADE")
    op.execute("DROP SCHEMA IF EXISTS ledger CASCADE")
    op.execute("DROP ROLE IF EXISTS eye_app")
