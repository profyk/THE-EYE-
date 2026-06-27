"""CLI: bootstrap a new tenant (business). Mirrors create_user.py/
create_ingestion_source.py's pattern -- there's no self-serve signup flow yet,
so this is how a new customer business gets onto the platform for now.

Usage:
    python -m scripts.create_tenant --name "Acme Corp" --slug acme
"""
import argparse
import asyncio

from app.db.session import SessionLocal
from app.schemas.tenant import TenantCreate
from app.services.tenant_service import create_tenant, get_tenant_by_slug


async def main(name: str, slug: str) -> None:
    async with SessionLocal() as db:
        if await get_tenant_by_slug(db, slug) is not None:
            print(f"Slug '{slug}' already exists.")
            return
        tenant = await create_tenant(db, TenantCreate(name=name, slug=slug))

    print(f"Tenant created: {tenant.id} ({tenant.name}, slug={tenant.slug})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--slug", required=True, help="lowercase, letters/numbers/hyphens only")
    args = parser.parse_args()
    asyncio.run(main(args.name, args.slug))
