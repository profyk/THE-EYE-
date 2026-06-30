from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import cast, func, select
from sqlalchemy import Date
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


# ── Billing overview ──────────────────────────────────────────────────────────

class BillingOverview(BaseModel):
    total_tenants: int
    paying: int
    trialing: int
    past_due: int
    cancelled: int
    other: int
    status_breakdown: list[dict]


@router.get("/billing", response_model=BillingOverview)
async def get_billing_overview(db: AsyncSession = Depends(get_db)) -> BillingOverview:
    tenants = list((await db.execute(select(Tenant))).scalars().all())
    breakdown: dict[str, int] = {}
    for t in tenants:
        s = t.paddle_subscription_status or "trial"
        breakdown[s] = breakdown.get(s, 0) + 1
    return BillingOverview(
        total_tenants=len(tenants),
        paying=breakdown.get("active", 0),
        trialing=breakdown.get("trial", 0),
        past_due=breakdown.get("past_due", 0),
        cancelled=breakdown.get("canceled", 0) + breakdown.get("cancelled", 0),
        other=sum(v for k, v in breakdown.items() if k not in ("active", "trial", "past_due", "canceled", "cancelled")),
        status_breakdown=[{"status": k, "count": v} for k, v in sorted(breakdown.items(), key=lambda x: -x[1])],
    )


# ── Platform analytics ────────────────────────────────────────────────────────

class PlatformAnalytics(BaseModel):
    events_by_day: list[dict]
    events_by_severity: list[dict]
    events_by_category: list[dict]
    top_tenants: list[dict]


@router.get("/analytics", response_model=PlatformAnalytics)
async def get_platform_analytics(db: AsyncSession = Depends(get_db)) -> PlatformAnalytics:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    day_rows = list((await db.execute(
        select(cast(LedgerEvent.occurred_at, Date).label("day"), func.count().label("cnt"))
        .where(LedgerEvent.occurred_at >= cutoff)
        .group_by(cast(LedgerEvent.occurred_at, Date))
        .order_by(cast(LedgerEvent.occurred_at, Date))
    )).all())
    events_by_day = [{"date": str(r.day), "count": r.cnt} for r in day_rows]

    sev_rows = list((await db.execute(
        select(LedgerEvent.severity, func.count().label("cnt"))
        .group_by(LedgerEvent.severity)
        .order_by(func.count().desc())
    )).all())
    events_by_severity = [{"severity": r.severity, "count": r.cnt} for r in sev_rows]

    cat_rows = list((await db.execute(
        select(LedgerEvent.event_category, func.count().label("cnt"))
        .group_by(LedgerEvent.event_category)
        .order_by(func.count().desc())
        .limit(10)
    )).all())
    events_by_category = [{"category": r.event_category, "count": r.cnt} for r in cat_rows]

    top_rows = list((await db.execute(
        select(LedgerEvent.tenant_id, func.count().label("cnt"))
        .where(LedgerEvent.occurred_at >= cutoff)
        .group_by(LedgerEvent.tenant_id)
        .order_by(func.count().desc())
        .limit(10)
    )).all())
    tenant_ids = [r.tenant_id for r in top_rows]
    tenants_map: dict = {}
    if tenant_ids:
        rows = list((await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars().all())
        tenants_map = {t.id: t.name for t in rows}
    top_tenants = [
        {"tenant_id": str(r.tenant_id), "tenant_name": tenants_map.get(r.tenant_id, "Unknown"), "count": r.cnt}
        for r in top_rows
    ]

    return PlatformAnalytics(
        events_by_day=events_by_day,
        events_by_severity=events_by_severity,
        events_by_category=events_by_category,
        top_tenants=top_tenants,
    )


# ── Plan management ───────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    price_monthly: float | None = None
    price_annual: float | None = None
    currency: str = "USD"
    paddle_price_id_monthly: str | None = None
    paddle_price_id_annual: str | None = None
    features: list[str] | None = None
    limits: dict | None = None
    is_public: bool = True
    sort_order: int = 0


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    price_monthly: float | None = None
    price_annual: float | None = None
    paddle_price_id_monthly: str | None = None
    paddle_price_id_annual: str | None = None
    features: list[str] | None = None
    limits: dict | None = None
    is_active: bool | None = None
    is_public: bool | None = None
    sort_order: int | None = None


class StaffPlanOut(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    price_monthly: float | None
    price_annual: float | None
    currency: str
    paddle_price_id_monthly: str | None
    paddle_price_id_annual: str | None
    features: list[str] | None
    limits: dict | None
    is_active: bool
    is_public: bool
    sort_order: int
    tenant_count: int = 0

    model_config = {"from_attributes": True}


def _staff_plan_out(p, tenant_count: int = 0) -> StaffPlanOut:
    return StaffPlanOut(
        id=p.id, name=p.name, slug=p.slug, description=p.description,
        price_monthly=float(p.price_monthly) if p.price_monthly else None,
        price_annual=float(p.price_annual) if p.price_annual else None,
        currency=p.currency,
        paddle_price_id_monthly=p.paddle_price_id_monthly,
        paddle_price_id_annual=p.paddle_price_id_annual,
        features=p.features, limits=p.limits,
        is_active=p.is_active, is_public=p.is_public, sort_order=p.sort_order,
        tenant_count=tenant_count,
    )


@router.get("/plans", response_model=list[StaffPlanOut])
async def staff_list_plans(db: AsyncSession = Depends(get_db)) -> list[StaffPlanOut]:
    from app.models.plan import Plan as PlanModel
    plans = list((await db.execute(select(PlanModel).order_by(PlanModel.sort_order))).scalars().all())
    counts_rows = list((await db.execute(
        select(Tenant.plan_id, func.count().label("cnt"))
        .where(Tenant.plan_id.isnot(None))
        .group_by(Tenant.plan_id)
    )).all())
    counts = {str(r.plan_id): r.cnt for r in counts_rows}
    return [_staff_plan_out(p, counts.get(str(p.id), 0)) for p in plans]


@router.post("/plans", response_model=StaffPlanOut, status_code=status.HTTP_201_CREATED)
async def staff_create_plan(data: PlanCreate, db: AsyncSession = Depends(get_db)) -> StaffPlanOut:
    from app.models.plan import Plan as PlanModel
    plan = PlanModel(
        name=data.name, slug=data.slug, description=data.description,
        price_monthly=data.price_monthly, price_annual=data.price_annual,
        currency=data.currency,
        paddle_price_id_monthly=data.paddle_price_id_monthly,
        paddle_price_id_annual=data.paddle_price_id_annual,
        features=data.features, limits=data.limits,
        is_public=data.is_public, sort_order=data.sort_order,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return _staff_plan_out(plan)


@router.patch("/plans/{plan_id}", response_model=StaffPlanOut)
async def staff_update_plan(plan_id: UUID, data: PlanUpdate, db: AsyncSession = Depends(get_db)) -> StaffPlanOut:
    from app.models.plan import Plan as PlanModel
    from datetime import datetime as _dt, timezone as _tz
    plan = (await db.execute(select(PlanModel).where(PlanModel.id == plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(plan, field, val)
    plan.updated_at = _dt.now(_tz.utc)
    await db.commit()
    await db.refresh(plan)
    return _staff_plan_out(plan)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def staff_archive_plan(plan_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    from app.models.plan import Plan as PlanModel
    plan = (await db.execute(select(PlanModel).where(PlanModel.id == plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    plan.is_active = False
    await db.commit()


class AssignPlanRequest(BaseModel):
    plan_id: UUID | None = None
    paddle_subscription_status: str | None = None


@router.post("/tenants/{tenant_id}/assign-plan", status_code=status.HTTP_200_OK)
async def staff_assign_plan(
    tenant_id: UUID,
    data: AssignPlanRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    tenant.plan_id = data.plan_id
    if data.paddle_subscription_status is not None:
        tenant.paddle_subscription_status = data.paddle_subscription_status
    await db.commit()
    return {"ok": True, "tenant_id": str(tenant_id), "plan_id": str(data.plan_id) if data.plan_id else None}
