"""CLI: walk the ledger, recompute every hash, and report the first divergence.

Usage:
    python -m scripts.verify_chain

This is the independent tool that proves the ledger's tamper-evidence claim is
demonstrable, not just asserted -- it shares app/ledger/verify.py's logic with
the (future) admin status endpoint, so there's exactly one implementation of
"what does an intact chain look like."
"""
import asyncio
import sys

from app.db.session import SessionLocal
from app.ledger.verify import verify_chain


async def main() -> int:
    async with SessionLocal() as db:
        report = await verify_chain(db)

    if report.ok:
        print(f"OK: verified {report.records_checked} records, chain intact")
        return 0

    print(f"TAMPER DETECTED after checking {report.records_checked} records:")
    for d in report.divergences:
        print(f"  sequence_num={d.sequence_num} field={d.field} expected={d.expected} actual={d.actual}")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
