"""seed the chain_head singleton row (genesis state)

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GENESIS_HASH = "0" * 64


def upgrade() -> None:
    # The genesis "record" is this chain_head row, not a ledger.events row: the
    # first real event (sequence_num=1) is appended with prev_hash=GENESIS_HASH
    # by app/ledger/append.py once a request arrives. append_event() has no
    # special-cased "genesis" logic -- it always reads chain_head and increments
    # from whatever is there, so seeding this row to (0, GENESIS_HASH) is what
    # makes the first real append land on sequence_num=1 naturally.
    op.execute(
        f"""
        INSERT INTO ledger.chain_head (id, last_sequence_num, last_hash)
        VALUES (true, 0, '{GENESIS_HASH}')
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM ledger.chain_head WHERE id = true")
