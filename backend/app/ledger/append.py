"""Serialized append-to-chain logic.

The hash chain requires strictly serial appends (record N's prev_hash must be
record N-1's record_hash). We get that by locking the singleton ledger.chain_head
row with SELECT ... FOR UPDATE for the duration of the append transaction, which
also serializes concurrent ingestion writers. For Phase 1 throughput this is fine;
if ingestion volume later requires more parallelism, sharded/per-source chains are
the documented scaling path -- not needed yet.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ledger.hashing import build_canonical_payload, compute_record_hash
from app.models.chain_head import ChainHead
from app.models.ledger_event import DEFAULT_TENANT_ID, LedgerEvent
from app.schemas.event import EventCreate


async def append_event(
    db: AsyncSession,
    event: EventCreate,
    *,
    source_id: uuid.UUID,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> LedgerEvent:
    """Append a single event to the ledger inside the caller's transaction.
    Caller is responsible for commit/rollback."""
    head = (await db.execute(select(ChainHead).where(ChainHead.id.is_(True)).with_for_update())).scalar_one()

    next_sequence_num = head.last_sequence_num + 1
    received_at = datetime.now(timezone.utc)

    payload = build_canonical_payload(
        sequence_num=next_sequence_num,
        tenant_id=str(tenant_id),
        source_id=str(source_id),
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        event_type=event.event_type,
        event_category=event.event_category,
        outcome=event.outcome,
        occurred_at=event.occurred_at,
        target_type=event.target_type,
        target_id=event.target_id,
        change_summary=event.change_summary,
        metadata=event.metadata,
        prev_hash=head.last_hash,
    )
    record_hash = compute_record_hash(payload)

    row = LedgerEvent(
        sequence_num=next_sequence_num,
        tenant_id=tenant_id,
        source_id=source_id,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        actor_display_name=event.actor_display_name,
        event_type=event.event_type,
        event_category=event.event_category,
        outcome=event.outcome,
        severity=event.severity,
        origin_host=event.origin_host,
        origin_ip=str(event.origin_ip) if event.origin_ip else None,
        origin_application=event.origin_application,
        occurred_at=event.occurred_at,
        received_at=received_at,
        target_type=event.target_type,
        target_id=event.target_id,
        change_summary=event.change_summary,
        metadata_=event.metadata,
        prev_hash=head.last_hash,
        record_hash=record_hash,
        created_at=received_at,
    )
    db.add(row)
    await db.flush()

    head.last_sequence_num = next_sequence_num
    head.last_hash = record_hash

    return row


async def append_batch(
    db: AsyncSession,
    events: list[EventCreate],
    *,
    source_id: uuid.UUID,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> list[LedgerEvent]:
    """Append a batch within one chain-head lock acquisition (cheaper than locking
    per-event). All-or-nothing: caller commits once after this returns, or rolls
    back entirely on any error -- a half-written batch would leave the chain in a
    confusing state for forensic reconstruction."""
    rows: list[LedgerEvent] = []
    for event in events:
        rows.append(await append_event(db, event, source_id=source_id, tenant_id=tenant_id))
    return rows
