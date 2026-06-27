"""CLI: create a new ingestion source and print its API key exactly once.

Usage:
    python -m scripts.create_ingestion_source --name "prod-postgres-trigger" --kind db_trigger --tenant-slug acme
"""
import argparse
import asyncio

from app.db.session import SessionLocal
from app.schemas.source import SourceCreate
from app.services.source_service import create_source
from app.services.tenant_service import get_tenant_by_slug


async def main(name: str, kind: str, tenant_slug: str | None) -> None:
    async with SessionLocal() as db:
        tenant_id = None
        if tenant_slug:
            tenant = await get_tenant_by_slug(db, tenant_slug)
            if tenant is None:
                print(f"No tenant with slug '{tenant_slug}' -- create it first with scripts.create_tenant.")
                return
            tenant_id = tenant.id

        created = await create_source(db, SourceCreate(name=name, source_kind=kind), tenant_id=tenant_id)

    print(f"Source created: {created.id} ({created.name}, kind={created.source_kind})")
    print(f"API key (shown once, store it now): {created.api_key}")
    print(f"Key prefix (safe to log/display): {created.api_key_prefix}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument(
        "--kind", required=True, choices=["db_trigger", "api_hook", "log_forwarder", "agent", "manual"]
    )
    parser.add_argument(
        "--tenant-slug", default=None, help="Which tenant this source's events belong to (defaults to the bootstrap tenant)"
    )
    args = parser.parse_args()
    asyncio.run(main(args.name, args.kind, args.tenant_slug))
