"""create ledger triggers and grants -- the append-only enforcement layer

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'eye_app') THEN
                GRANT INSERT, SELECT ON ledger.events TO eye_app;
                GRANT SELECT ON ledger.chain_head TO eye_app;
                GRANT UPDATE (last_sequence_num, last_hash) ON ledger.chain_head TO eye_app;
            END IF;
        END $$;
        """
    )

    # Belt-and-suspenders trigger: even if grants regress or a future role is
    # accidentally given broader privileges, this makes the append-only intent
    # explicit and gives a clear, auditable error instead of relying solely on
    # GRANT state. Documented limitation: a true Postgres superuser could still
    # DROP or DISABLE this trigger -- that gap is what external notarization
    # (ledger.notarizations, migration 0005) exists to catch independently.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION ledger.reject_mutation() RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'ledger.events is append-only: % is not permitted', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_ledger_events_no_update
        BEFORE UPDATE ON ledger.events
        FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_ledger_events_no_delete
        BEFORE DELETE ON ledger.events
        FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ledger_events_no_delete ON ledger.events")
    op.execute("DROP TRIGGER IF EXISTS trg_ledger_events_no_update ON ledger.events")
    op.execute("DROP FUNCTION IF EXISTS ledger.reject_mutation()")
    op.execute("REVOKE UPDATE (last_sequence_num, last_hash) ON ledger.chain_head FROM eye_app")
    op.execute("REVOKE SELECT ON ledger.chain_head FROM eye_app")
    op.execute("REVOKE INSERT, SELECT ON ledger.events FROM eye_app")
