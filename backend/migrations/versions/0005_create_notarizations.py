"""create ledger.notarizations

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notarizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_sequence_num", sa.BigInteger, nullable=False),
        sa.Column("to_sequence_num", sa.BigInteger, nullable=False),
        sa.Column("root_hash", sa.String(64), nullable=False),
        sa.Column("notarization_provider", sa.String(32), nullable=False, server_default="local-only"),
        sa.Column("provider_receipt", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="ledger",
    )
    # Phase 1 only ever inserts here (manual/scripted local snapshots); no UPDATE/DELETE needed.
    op.execute("GRANT INSERT, SELECT ON ledger.notarizations TO eye_app")


def downgrade() -> None:
    op.execute("REVOKE INSERT, SELECT ON ledger.notarizations FROM eye_app")
    op.drop_table("notarizations", schema="ledger")
