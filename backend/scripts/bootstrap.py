"""One-time bootstrap: create the first tenant and admin user from env vars.

Runs automatically on startup (see railway.json startCommand). Skips
silently if any users already exist, so it's safe to run on every deploy.

Required env vars (only needed on first deploy, can be removed after):
    BOOTSTRAP_TENANT_NAME   e.g. "Acme Corp"
    BOOTSTRAP_TENANT_SLUG   e.g. "acme"  (lowercase, letters/numbers/hyphens)
    BOOTSTRAP_ADMIN_USERNAME  e.g. "admin"
    BOOTSTRAP_ADMIN_PASSWORD  e.g. "correct-horse-battery-staple"

If any of these are missing the script skips without error.
"""
import asyncio
import os
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.tenant import TenantCreate
from app.schemas.user import UserCreate
from app.services.tenant_service import create_tenant, get_tenant_by_slug
from app.services.user_service import create_user, get_user_by_username


async def main() -> None:
    tenant_name = os.environ.get("BOOTSTRAP_TENANT_NAME", "").strip()
    tenant_slug = os.environ.get("BOOTSTRAP_TENANT_SLUG", "").strip()
    admin_username = os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "").strip()
    admin_password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "").strip()

    if not all([tenant_name, tenant_slug, admin_username, admin_password]):
        return

    if len(admin_password) < 12:
        print("BOOTSTRAP ERROR: BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.", flush=True)
        sys.exit(1)

    async with SessionLocal() as db:
        user_count = (await db.execute(select(User))).scalars().first()
        if user_count is not None:
            print("Bootstrap: users already exist, skipping.", flush=True)
            return

        tenant = await get_tenant_by_slug(db, tenant_slug)
        if tenant is None:
            tenant = await create_tenant(db, TenantCreate(name=tenant_name, slug=tenant_slug))
            print(f"Bootstrap: tenant created — {tenant.name} ({tenant.slug})", flush=True)

        if await get_user_by_username(db, admin_username) is None:
            await create_user(
                db,
                UserCreate(username=admin_username, password=admin_password, role="admin", tenant_id=tenant.id),
            )
            print(f"Bootstrap: admin user created — {admin_username} (tenant: {tenant.slug})", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
