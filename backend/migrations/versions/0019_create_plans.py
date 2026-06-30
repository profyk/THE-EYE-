"""create plans table and link tenants

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price_monthly", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_annual", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("paddle_price_id_monthly", sa.String(255), nullable=True),
        sa.Column("paddle_price_id_annual", sa.String(255), nullable=True),
        sa.Column("features", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("limits", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="app",
    )
    op.create_index("ix_plans_slug", "plans", ["slug"], schema="app", unique=True)

    op.add_column(
        "tenants",
        sa.Column(
            "plan_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app.plans.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="app",
    )

    op.execute("""
        INSERT INTO app.plans (name, slug, description, price_monthly, price_annual, currency, features, limits, sort_order)
        VALUES
        (
            'Starter',
            'starter',
            'Perfect for small teams getting started with audit trails.',
            29.00, 290.00, 'USD',
            '["Up to 5 users", "50,000 events/month", "5 API keys", "30-day log retention", "Email alerts", "Standard support"]'::jsonb,
            '{"users": 5, "api_keys": 5, "events_per_month": 50000, "retention_days": 30}'::jsonb,
            1
        ),
        (
            'Professional',
            'professional',
            'For growing organisations that need more power and longer retention.',
            99.00, 990.00, 'USD',
            '["Up to 25 users", "500,000 events/month", "20 API keys", "90-day log retention", "Real-time alerts", "Webhook integrations", "Priority support"]'::jsonb,
            '{"users": 25, "api_keys": 20, "events_per_month": 500000, "retention_days": 90}'::jsonb,
            2
        ),
        (
            'Enterprise',
            'enterprise',
            'Unlimited scale with dedicated support and custom retention.',
            NULL, NULL, 'USD',
            '["Unlimited users", "Unlimited events", "Unlimited API keys", "Custom retention", "SSO / SAML", "Dedicated support", "Custom SLA", "On-premise option"]'::jsonb,
            '{"users": null, "api_keys": null, "events_per_month": null, "retention_days": null}'::jsonb,
            3
        )
    """)


def downgrade() -> None:
    op.drop_column("tenants", "plan_id", schema="app")
    op.drop_index("ix_plans_slug", table_name="plans", schema="app")
    op.drop_table("plans", schema="app")
