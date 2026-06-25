"""CLI: create a new ingestion source and print its API key exactly once.

Usage:
    python -m scripts.create_ingestion_source --name "prod-postgres-trigger" --kind db_trigger
"""
import argparse
import asyncio

from app.db.session import SessionLocal
from app.schemas.source import SourceCreate
from app.services.source_service import create_source


async def main(name: str, kind: str) -> None:
    async with SessionLocal() as db:
        created = await create_source(db, SourceCreate(name=name, source_kind=kind))

    print(f"Source created: {created.id} ({created.name}, kind={created.source_kind})")
    print(f"API key (shown once, store it now): {created.api_key}")
    print(f"Key prefix (safe to log/display): {created.api_key_prefix}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument(
        "--kind", required=True, choices=["db_trigger", "api_hook", "log_forwarder", "agent", "manual"]
    )
    args = parser.parse_args()
    asyncio.run(main(args.name, args.kind))
