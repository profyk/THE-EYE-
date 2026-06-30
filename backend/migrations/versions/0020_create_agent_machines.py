"""create agent_machines table

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_machines",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("app.tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("machine_id", sa.String(64), nullable=False),
        sa.Column("hostname", sa.String(255), nullable=False, server_default="unknown"),
        sa.Column("os", sa.String(64), nullable=True),
        sa.Column("agent_version", sa.String(32), nullable=True),
        sa.Column("agent_label", sa.String(128), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("last_heartbeat_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("registered_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        schema="app",
    )
    op.create_index("ix_agent_machines_tenant_id", "agent_machines", ["tenant_id"], schema="app")
    op.create_unique_constraint(
        "uq_agent_machines_machine_id_tenant",
        "agent_machines",
        ["machine_id", "tenant_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("uq_agent_machines_machine_id_tenant", "agent_machines", schema="app", type_="unique")
    op.drop_index("ix_agent_machines_tenant_id", table_name="agent_machines", schema="app")
    op.drop_table("agent_machines", schema="app")
