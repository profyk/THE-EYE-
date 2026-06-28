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

    # Restricted runtime role -- created only when the DB user has CREATEROLE.
    # Managed Postgres (Railway, RDS, etc.) often disallows CREATEROLE even for
    # the admin user; in that case we skip creation and the app falls back to
    # connecting as the admin user (DATABASE_URL = ADMIN_DATABASE_URL).
    # The trigger-based append-only guarantee holds regardless of which role connects.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                BEGIN
                    CREATE ROLE eye_app LOGIN PASSWORD 'eye_app_devpassword';
                EXCEPTION WHEN insufficient_privilege THEN
                    RAISE NOTICE 'eye_app role not created (insufficient privilege) -- set DATABASE_URL = ADMIN_DATABASE_URL in your env';
                END;
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                GRANT USAGE ON SCHEMA ledger TO eye_app;
                GRANT USAGE ON SCHEMA app TO eye_app;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("REVOKE USAGE ON SCHEMA app FROM eye_app")
    op.execute("REVOKE USAGE ON SCHEMA ledger FROM eye_app")
    op.execute("DROP SCHEMA IF EXISTS app CASCADE")
    op.execute("DROP SCHEMA IF EXISTS ledger CASCADE")
    op.execute("DROP ROLE IF EXISTS eye_app")
