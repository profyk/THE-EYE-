"""create app.whistleblower_reports

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whistleblower_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("report_text", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="app",
    )
    op.execute("GRANT SELECT, INSERT ON app.whistleblower_reports TO eye_app")


def downgrade() -> None:
    op.execute("REVOKE SELECT, INSERT ON app.whistleblower_reports FROM eye_app")
    op.drop_table("whistleblower_reports", schema="app")
