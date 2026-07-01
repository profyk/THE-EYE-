"""Add company profile fields to tenants table

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("contact_email",        sa.String(256), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("phone",                sa.String(64),  nullable=True), schema="app")
    op.add_column("tenants", sa.Column("website",              sa.String(256), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("country",              sa.String(64),  nullable=True), schema="app")
    op.add_column("tenants", sa.Column("industry",             sa.String(128), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("logo_url",             sa.String(512), nullable=True), schema="app")
    op.add_column("tenants", sa.Column("profile_description",  sa.Text,        nullable=True), schema="app")


def downgrade() -> None:
    for col in ("profile_description", "logo_url", "industry", "country", "website", "phone", "contact_email"):
        op.drop_column("tenants", col, schema="app")
