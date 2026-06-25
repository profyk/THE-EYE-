"""alter ingestion_sources to allow 'system' kind; seed internal sources

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-19
"""
import hashlib
import secrets
from typing import Sequence, Union

from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# These seeded sources are never authenticated via their API key (the platform
# inserts events directly with this source_id from internal code paths, e.g.
# auth.py's login logging -- it never goes through the public /v1/events
# bearer-key flow). The key is still hashed for consistency with every other
# row in this table; the plaintext is generated and discarded here.
SEEDED_SOURCES = ["the-eye-platform", "whistleblower-portal"]


def upgrade() -> None:
    op.execute("ALTER TABLE app.ingestion_sources DROP CONSTRAINT ck_ingestion_sources_kind")
    op.execute(
        """
        ALTER TABLE app.ingestion_sources
        ADD CONSTRAINT ck_ingestion_sources_kind
        CHECK (source_kind IN ('db_trigger','api_hook','log_forwarder','agent','manual','system'))
        """
    )

    for name in SEEDED_SOURCES:
        raw_key = "eye_live_" + secrets.token_urlsafe(32)
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        key_prefix = raw_key[:17]
        op.execute(
            f"""
            INSERT INTO app.ingestion_sources (name, source_kind, api_key_hash, api_key_prefix, is_active)
            VALUES ('{name}', 'system', '{key_hash}', '{key_prefix}', true)
            ON CONFLICT (api_key_prefix) DO NOTHING
            """
        )


def downgrade() -> None:
    for name in SEEDED_SOURCES:
        op.execute(f"DELETE FROM app.ingestion_sources WHERE name = '{name}' AND source_kind = 'system'")
    op.execute("ALTER TABLE app.ingestion_sources DROP CONSTRAINT ck_ingestion_sources_kind")
    op.execute(
        """
        ALTER TABLE app.ingestion_sources
        ADD CONSTRAINT ck_ingestion_sources_kind
        CHECK (source_kind IN ('db_trigger','api_hook','log_forwarder','agent','manual'))
        """
    )
