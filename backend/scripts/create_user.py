"""CLI: bootstrap a real user account (mirrors create_ingestion_source.py).

Usage:
    python -m scripts.create_user --username admin --role admin --tenant-slug acme
    python -m scripts.create_user --username platform-admin --role platform_admin
    (prompts for a password; or pass --password to script it non-interactively)
"""
import argparse
import asyncio

import getpass

from app.db.session import SessionLocal
from app.schemas.user import UserCreate
from app.services.tenant_service import get_tenant_by_slug
from app.services.user_service import create_user, get_user_by_username


async def main(username: str, password: str, role: str, tenant_slug: str | None) -> None:
    async with SessionLocal() as db:
        if await get_user_by_username(db, username) is not None:
            print(f"Username '{username}' already exists.")
            return

        tenant_id = None
        if tenant_slug:
            tenant = await get_tenant_by_slug(db, tenant_slug)
            if tenant is None:
                print(f"No tenant with slug '{tenant_slug}' -- create it first with scripts.create_tenant.")
                return
            tenant_id = tenant.id
        elif role != "platform_admin":
            print("--tenant-slug is required for every role except platform_admin.")
            return

        user = await create_user(db, UserCreate(username=username, password=password, role=role, tenant_id=tenant_id))

    print(f"User created: {user.username} (role={user.role}, tenant_id={user.tenant_id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument(
        "--role",
        required=True,
        choices=[
            "admin",
            "investigator",
            "chief_auditor",
            "compliance_officer",
            "security_officer",
            "executive_authority",
            "platform_admin",
        ],
    )
    parser.add_argument("--tenant-slug", default=None, help="Required for every role except platform_admin")
    parser.add_argument("--password", default=None, help="If omitted, you'll be prompted (not echoed)")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password: ")
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")

    asyncio.run(main(args.username, password, args.role, args.tenant_slug))
