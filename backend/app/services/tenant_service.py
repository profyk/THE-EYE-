from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate


async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
    tenant = Tenant(name=data.name, slug=data.slug, created_at=datetime.now(timezone.utc))
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    return (await db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()


async def get_tenant_by_id(db: AsyncSession, tenant_id: UUID) -> Tenant | None:
    return (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()


async def list_tenants(db: AsyncSession) -> list[Tenant]:
    return list((await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all())
