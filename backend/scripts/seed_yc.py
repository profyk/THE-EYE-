"""CLI wrapper around the demo seed service.

Usage (from backend/ directory):
    python -m scripts.seed_yc [--tenant-id <uuid>]
"""
import argparse
import asyncio

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.ledger_event import DEFAULT_TENANT_ID
from app.models.tenant import Tenant
from app.services.demo_seed import run_demo_seed


async def main(tenant_id_override: str | None) -> None:
    from uuid import UUID

    if tenant_id_override:
        target_tenant = UUID(tenant_id_override)
    else:
        async with SessionLocal() as db:
            tenants = (
                await db.execute(
                    select(Tenant).where(Tenant.is_active.is_(True)).order_by(Tenant.created_at)
                )
            ).scalars().all()
        real = [t for t in tenants if t.id != DEFAULT_TENANT_ID]
        if not real:
            print("No active tenants found. Sign up first, then re-run.")
            return
        if len(real) > 1:
            print("Multiple tenants found:")
            for t in real:
                print(f"  {t.id}  {t.name} ({t.slug})")
            print("Re-run with --tenant-id <uuid> to pick one.")
            return
        target_tenant = real[0].id
        print(f"Auto-detected tenant: {real[0].name} ({target_tenant})")

    async with SessionLocal() as db:
        result = await run_demo_seed(db, tenant_id=target_tenant)

    print(f"\nYC seed complete — {result['inserted']} events inserted, {result['skipped']} skipped")
    print(f"  Source: {result['source_id']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed YC demo data into THE EYE")
    parser.add_argument("--tenant-id", default=None, help="UUID of tenant to seed")
    args = parser.parse_args()
    asyncio.run(main(args.tenant_id))
