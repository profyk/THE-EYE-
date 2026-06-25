"""Independent chain verification.

Walks ledger.events in sequence order and recomputes each record_hash from the
same canonical payload builder used at write time (app/ledger/hashing.py), so
verification logic can never drift from write logic. This is what makes the
"immutable ledger" claim demonstrable rather than just asserted.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ledger.hashing import GENESIS_HASH, build_canonical_payload, compute_record_hash
from app.models.ledger_event import LedgerEvent


@dataclass
class ChainDivergence:
    sequence_num: int
    field: str
    expected: str
    actual: str


@dataclass
class VerificationReport:
    records_checked: int = 0
    divergences: list[ChainDivergence] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.divergences


async def verify_chain(db: AsyncSession) -> VerificationReport:
    report = VerificationReport()
    expected_prev_hash = GENESIS_HASH

    rows = (
        await db.execute(select(LedgerEvent).order_by(LedgerEvent.sequence_num.asc()))
    ).scalars().all()

    for row in rows:
        report.records_checked += 1

        if row.prev_hash != expected_prev_hash:
            report.divergences.append(
                ChainDivergence(
                    sequence_num=row.sequence_num,
                    field="prev_hash",
                    expected=expected_prev_hash,
                    actual=row.prev_hash,
                )
            )

        payload = build_canonical_payload(
            sequence_num=row.sequence_num,
            tenant_id=str(row.tenant_id),
            source_id=str(row.source_id),
            actor_type=row.actor_type,
            actor_id=row.actor_id,
            event_type=row.event_type,
            event_category=row.event_category,
            outcome=row.outcome,
            occurred_at=row.occurred_at,
            target_type=row.target_type,
            target_id=row.target_id,
            change_summary=row.change_summary,
            metadata=row.metadata_,
            prev_hash=row.prev_hash,
        )
        recomputed_hash = compute_record_hash(payload)

        if recomputed_hash != row.record_hash:
            report.divergences.append(
                ChainDivergence(
                    sequence_num=row.sequence_num,
                    field="record_hash",
                    expected=recomputed_hash,
                    actual=row.record_hash,
                )
            )

        expected_prev_hash = row.record_hash

    return report
