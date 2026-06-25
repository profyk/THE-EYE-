"""Canonical hash computation for the ledger chain.

This is the single source of truth for what gets hashed and how. Both the
ingestion append path (app/ledger/append.py) and the independent verification
tool (scripts/verify_chain.py) import compute_record_hash from here, so the
write path and the verify path can never silently drift apart.

We hash a deliberately-ordered subset of fields rather than the whole row.
DB-generated bookkeeping columns (the row's UUID `id`, the `created_at`
wall-clock) aren't part of the hashed contract -- including them would force
the app to control values that are naturally server-generated, which makes
re-verification brittle for no security benefit.
"""

import hashlib
import json
from datetime import datetime
from typing import Any

GENESIS_HASH = "0" * 64


def _iso(dt: datetime) -> str:
    return dt.astimezone(tz=None).isoformat() if dt.tzinfo is None else dt.isoformat()


def build_canonical_payload(
    *,
    sequence_num: int,
    tenant_id: str,
    source_id: str,
    actor_type: str,
    actor_id: str,
    event_type: str,
    event_category: str,
    outcome: str,
    occurred_at: datetime,
    target_type: str | None,
    target_id: str | None,
    change_summary: dict[str, Any] | None,
    metadata: dict[str, Any],
    prev_hash: str,
) -> dict[str, Any]:
    """Build the exact, explicitly-ordered dict that gets hashed. Field order here
    is documentation of the contract -- json.dumps(sort_keys=True) below makes the
    actual byte serialization order-independent, but keeping this order matches
    the schema docs and keeps the payload human-auditable."""
    return {
        "sequence_num": sequence_num,
        "tenant_id": str(tenant_id),
        "source_id": str(source_id),
        "actor_type": actor_type,
        "actor_id": actor_id,
        "event_type": event_type,
        "event_category": event_category,
        "outcome": outcome,
        "occurred_at": _iso(occurred_at),
        "target_type": target_type,
        "target_id": target_id,
        "change_summary": change_summary,
        "metadata": metadata,
        "prev_hash": prev_hash,
    }


def compute_record_hash(canonical_payload: dict[str, Any]) -> str:
    serialized = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
