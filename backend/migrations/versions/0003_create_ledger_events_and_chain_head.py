"""create ledger.events and ledger.chain_head

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GENESIS_HASH = "0" * 64


def upgrade() -> None:
    # sequence_num is a plain BIGINT, not a DB identity column: the application
    # (app/ledger/append.py) assigns it explicitly while holding the chain_head
    # row lock, since the value must be derived from the actual previous record's
    # hash, not from an independent DB sequence. The UNIQUE constraint is the
    # backstop that would surface a concurrency bug as an IntegrityError.
    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sequence_num", sa.BigInteger, nullable=False, unique=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False,
                   server_default=sa.text("'00000000-0000-0000-0000-000000000000'")),
        sa.Column("source_id", postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("app.ingestion_sources.id"), nullable=False),
        sa.Column("actor_type", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.String(256), nullable=False),
        sa.Column("actor_display_name", sa.String(256), nullable=True),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("event_category", sa.String(32), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("origin_host", sa.String(255), nullable=True),
        sa.Column("origin_ip", postgresql.INET, nullable=True),
        sa.Column("origin_application", sa.String(255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("target_type", sa.String(128), nullable=True),
        sa.Column("target_id", sa.String(512), nullable=True),
        sa.Column("change_summary", postgresql.JSONB, nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("record_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "actor_type IN ('user','service_account','system','unknown')", name="ck_events_actor_type"
        ),
        sa.CheckConstraint(
            "event_category IN ('authentication','authorization','data_access','data_modification',"
            "'configuration','process_execution','network','financial_transaction','administrative','system')",
            name="ck_events_category",
        ),
        sa.CheckConstraint("outcome IN ('success','failure','denied','unknown')", name="ck_events_outcome"),
        sa.CheckConstraint(
            "severity IN ('debug','info','warning','high','critical')", name="ck_events_severity"
        ),
        schema="ledger",
    )

    op.create_index("ix_ledger_events_occurred_at", "events", ["occurred_at"], schema="ledger")
    op.create_index("ix_ledger_events_actor", "events", ["actor_id"], schema="ledger")
    op.create_index("ix_ledger_events_event_type", "events", ["event_type"], schema="ledger")
    op.create_index("ix_ledger_events_category", "events", ["event_category"], schema="ledger")
    op.create_index("ix_ledger_events_source", "events", ["source_id"], schema="ledger")
    op.create_index("ix_ledger_events_target", "events", ["target_type", "target_id"], schema="ledger")
    op.create_index("ix_ledger_events_tenant", "events", ["tenant_id"], schema="ledger")
    op.execute("CREATE INDEX ix_ledger_events_metadata_gin ON ledger.events USING GIN (metadata)")

    op.create_table(
        "chain_head",
        sa.Column("id", sa.Boolean, primary_key=True, server_default=sa.text("true")),
        sa.Column("last_sequence_num", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("last_hash", sa.String(64), nullable=False, server_default=GENESIS_HASH),
        sa.CheckConstraint("id = true", name="ck_chain_head_singleton"),
        schema="ledger",
    )


def downgrade() -> None:
    op.drop_table("chain_head", schema="ledger")
    op.drop_index("ix_ledger_events_metadata_gin", table_name="events", schema="ledger")
    for idx in [
        "ix_ledger_events_tenant", "ix_ledger_events_target", "ix_ledger_events_source",
        "ix_ledger_events_category", "ix_ledger_events_event_type", "ix_ledger_events_actor",
        "ix_ledger_events_occurred_at",
    ]:
        op.drop_index(idx, table_name="events", schema="ledger")
    op.drop_table("events", schema="ledger")
