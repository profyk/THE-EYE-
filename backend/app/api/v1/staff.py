from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.models.ledger_event import LedgerEvent
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(
    prefix="/v1/staff",
    tags=["staff"],
    dependencies=[Depends(require_role("super_admin"))],
)


class TenantStats(BaseModel):
    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    paddle_subscription_status: str | None
    user_count: int
    event_count_30d: int
    last_event_at: datetime | None

    model_config = {"from_attributes": True}


class PlatformOverview(BaseModel):
    total_tenants: int
    active_tenants: int
    suspended_tenants: int
    total_users: int
    total_events_30d: int
    new_tenants_30d: int


class UserWithTenant(BaseModel):
    id: UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime
    tenant_id: UUID | None
    tenant_name: str | None

    model_config = {"from_attributes": True}


async def _tenant_stats(db: AsyncSession, t: Tenant) -> TenantStats:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    user_count = (await db.execute(
        select(func.count()).select_from(User).where(User.tenant_id == t.id)
    )).scalar_one()
    event_count_30d = (await db.execute(
        select(func.count()).select_from(LedgerEvent).where(
            LedgerEvent.tenant_id == t.id,
            LedgerEvent.occurred_at >= cutoff,
        )
    )).scalar_one()
    last_event_at = (await db.execute(
        select(LedgerEvent.occurred_at)
        .where(LedgerEvent.tenant_id == t.id)
        .order_by(LedgerEvent.occurred_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return TenantStats(
        id=t.id,
        name=t.name,
        slug=t.slug,
        is_active=t.is_active,
        created_at=t.created_at,
        paddle_subscription_status=t.paddle_subscription_status,
        user_count=user_count,
        event_count_30d=event_count_30d,
        last_event_at=last_event_at,
    )


@router.get("/overview", response_model=PlatformOverview)
async def get_overview(db: AsyncSession = Depends(get_db)) -> PlatformOverview:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    active_tenants = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.is_active == True)  # noqa: E712
    )).scalar_one()
    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.role != "super_admin")
    )).scalar_one()
    total_events_30d = (await db.execute(
        select(func.count()).select_from(LedgerEvent).where(LedgerEvent.occurred_at >= cutoff)
    )).scalar_one()
    new_tenants_30d = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.created_at >= cutoff)
    )).scalar_one()
    return PlatformOverview(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        suspended_tenants=total_tenants - active_tenants,
        total_users=total_users,
        total_events_30d=total_events_30d,
        new_tenants_30d=new_tenants_30d,
    )


@router.get("/tenants", response_model=list[TenantStats])
async def list_tenants_with_stats(db: AsyncSession = Depends(get_db)) -> list[TenantStats]:
    tenants = list((await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all())
    return [await _tenant_stats(db, t) for t in tenants]


@router.get("/tenants/{tenant_id}", response_model=TenantStats)
async def get_tenant_detail(tenant_id: UUID, db: AsyncSession = Depends(get_db)) -> TenantStats:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return await _tenant_stats(db, t)


@router.post("/tenants/{tenant_id}/suspend", response_model=TenantStats)
async def suspend_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)) -> TenantStats:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    t.is_active = False
    await db.commit()
    await db.refresh(t)
    return await _tenant_stats(db, t)


@router.post("/tenants/{tenant_id}/activate", response_model=TenantStats)
async def activate_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)) -> TenantStats:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    t.is_active = True
    await db.commit()
    await db.refresh(t)
    return await _tenant_stats(db, t)


@router.get("/users", response_model=list[UserWithTenant])
async def list_all_users(db: AsyncSession = Depends(get_db)) -> list[UserWithTenant]:
    users = list((await db.execute(
        select(User).where(User.role != "super_admin").order_by(User.created_at.desc())
    )).scalars().all())
    tenant_ids = list({u.tenant_id for u in users if u.tenant_id is not None})
    tenant_names: dict[UUID, str] = {}
    if tenant_ids:
        rows = list((await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars().all())
        tenant_names = {r.id: r.name for r in rows}
    return [
        UserWithTenant(
            id=u.id,
            username=u.username,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            tenant_id=u.tenant_id,
            tenant_name=tenant_names.get(u.tenant_id) if u.tenant_id else None,
        )
        for u in users
    ]
