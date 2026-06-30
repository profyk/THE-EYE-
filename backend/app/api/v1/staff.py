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


# ── Staff admin management ────────────────────────────────────────────────────

import secrets as _secrets

from app.api.deps import get_current_user
from app.core.security import validate_password_strength
from app.models.announcement import Announcement
from app.models.api_key import ApiKey
from app.models.staff_note import StaffNote
from app.schemas.user import UserCreate
from app.services.user_service import (
    create_user,
    get_user_by_username,
    set_user_password,
)


class StaffAdminOut(BaseModel):
    id: UUID
    username: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class CreateAdminRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12)


@router.get("/admins", response_model=list[StaffAdminOut])
async def list_staff_admins(db: AsyncSession = Depends(get_db)) -> list[StaffAdminOut]:
    admins = list((await db.execute(
        select(User).where(User.role == "super_admin").order_by(User.created_at.asc())
    )).scalars().all())
    return [StaffAdminOut.model_validate(a) for a in admins]


@router.post("/admins", response_model=StaffAdminOut, status_code=status.HTTP_201_CREATED)
async def create_staff_admin(data: CreateAdminRequest, db: AsyncSession = Depends(get_db)) -> StaffAdminOut:
    err = validate_password_strength(data.password, 12)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)
    if await get_user_by_username(db, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    user = await create_user(db, UserCreate(username=data.username, password=data.password, role="super_admin"))
    return StaffAdminOut.model_validate(user)


@router.post("/admins/{admin_id}/suspend", response_model=StaffAdminOut)
async def suspend_staff_admin(
    admin_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StaffAdminOut:
    admin = (await db.execute(select(User).where(User.id == admin_id, User.role == "super_admin"))).scalar_one_or_none()
    if not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff admin not found")
    if admin.id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot suspend yourself")
    admin.is_active = False
    await db.commit()
    await db.refresh(admin)
    return StaffAdminOut.model_validate(admin)


@router.post("/admins/{admin_id}/activate", response_model=StaffAdminOut)
async def activate_staff_admin(admin_id: UUID, db: AsyncSession = Depends(get_db)) -> StaffAdminOut:
    admin = (await db.execute(select(User).where(User.id == admin_id, User.role == "super_admin"))).scalar_one_or_none()
    if not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff admin not found")
    admin.is_active = True
    await db.commit()
    await db.refresh(admin)
    return StaffAdminOut.model_validate(admin)


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_admin(
    admin_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    admin = (await db.execute(select(User).where(User.id == admin_id, User.role == "super_admin"))).scalar_one_or_none()
    if not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff admin not found")
    if admin.id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")
    total_admins = (await db.execute(select(func.count()).select_from(User).where(User.role == "super_admin"))).scalar_one()
    if total_admins <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last staff admin")
    await db.delete(admin)
    await db.commit()


# ── Client user management ────────────────────────────────────────────────────

def _user_with_tenant(u: User, tenant_names: dict) -> UserWithTenant:
    return UserWithTenant(
        id=u.id,
        username=u.username,
        role=u.role,
        is_active=u.is_active,
        created_at=u.created_at,
        tenant_id=u.tenant_id,
        tenant_name=tenant_names.get(u.tenant_id) if u.tenant_id else None,
    )


async def _resolve_tenant_names(db: AsyncSession, users: list[User]) -> dict:
    tenant_ids = list({u.tenant_id for u in users if u.tenant_id is not None})
    if not tenant_ids:
        return {}
    rows = list((await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars().all())
    return {r.id: r.name for r in rows}


@router.post("/users/{user_id}/suspend", response_model=UserWithTenant)
async def suspend_client_user(user_id: UUID, db: AsyncSession = Depends(get_db)) -> UserWithTenant:
    user = (await db.execute(select(User).where(User.id == user_id, User.role != "super_admin"))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return _user_with_tenant(user, await _resolve_tenant_names(db, [user]))


@router.post("/users/{user_id}/activate", response_model=UserWithTenant)
async def activate_client_user(user_id: UUID, db: AsyncSession = Depends(get_db)) -> UserWithTenant:
    user = (await db.execute(select(User).where(User.id == user_id, User.role != "super_admin"))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return _user_with_tenant(user, await _resolve_tenant_names(db, [user]))


@router.post("/users/{user_id}/reset-password")
async def reset_client_user_password(user_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id, User.role != "super_admin"))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    temp_password = _secrets.token_urlsafe(12)
    await set_user_password(db, user, temp_password)
    return {"temp_password": temp_password}


# ── Platform-wide API keys ────────────────────────────────────────────────────

class StaffApiKeyOut(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_name: str
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    created_by_username: str | None
    model_config = {"from_attributes": True}


@router.get("/api-keys", response_model=list[StaffApiKeyOut])
async def list_platform_api_keys(db: AsyncSession = Depends(get_db)) -> list[StaffApiKeyOut]:
    keys = list((await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))).scalars().all())
    tenant_ids = list({k.tenant_id for k in keys})
    creator_ids = list({k.created_by for k in keys if k.created_by is not None})
    tenants_map: dict = {}
    creators_map: dict = {}
    if tenant_ids:
        rows = list((await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars().all())
        tenants_map = {r.id: r.name for r in rows}
    if creator_ids:
        rows2 = list((await db.execute(select(User).where(User.id.in_(creator_ids)))).scalars().all())
        creators_map = {r.id: r.username for r in rows2}
    return [
        StaffApiKeyOut(
            id=k.id,
            tenant_id=k.tenant_id,
            tenant_name=tenants_map.get(k.tenant_id, "Unknown"),
            name=k.name,
            key_prefix=k.key_prefix,
            is_active=k.is_active,
            last_used_at=k.last_used_at,
            expires_at=k.expires_at,
            created_at=k.created_at,
            created_by_username=creators_map.get(k.created_by) if k.created_by else None,
        )
        for k in keys
    ]


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_platform_api_key(key_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    key = (await db.execute(select(ApiKey).where(ApiKey.id == key_id))).scalar_one_or_none()
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    key.is_active = False
    await db.commit()


# ── Revenue intelligence ──────────────────────────────────────────────────────

class RevenueStats(BaseModel):
    mrr: float
    arr: float
    paying_count: int
    trialing_count: int
    past_due_count: int
    churned_count: int
    growth_30d: int
    monthly_trend: list[dict]


@router.get("/revenue", response_model=RevenueStats)
async def get_revenue_stats(db: AsyncSession = Depends(get_db)) -> RevenueStats:
    from sqlalchemy import extract, text as sa_text
    cutoff_30d = datetime.now(timezone.utc) - timedelta(days=30)
    cutoff_6m = datetime.now(timezone.utc) - timedelta(days=180)

    tenants = list((await db.execute(select(Tenant))).scalars().all())
    paying = sum(1 for t in tenants if t.paddle_subscription_status == "active")
    trialing = sum(1 for t in tenants if not t.paddle_subscription_status or t.paddle_subscription_status == "trial")
    past_due = sum(1 for t in tenants if t.paddle_subscription_status == "past_due")
    churned = sum(1 for t in tenants if t.paddle_subscription_status in ("canceled", "cancelled"))
    mrr = paying * 29.0 + trialing * 0.0 + past_due * 29.0
    arr = mrr * 12

    growth_30d = sum(1 for t in tenants if t.created_at and t.created_at.replace(tzinfo=timezone.utc if t.created_at.tzinfo is None else t.created_at.tzinfo) >= cutoff_30d)

    from sqlalchemy.dialects.postgresql import extract as pg_extract
    trend_rows = list((await db.execute(
        select(
            func.to_char(Tenant.created_at, "YYYY-MM").label("month"),
            func.count().label("cnt"),
        )
        .where(Tenant.created_at >= cutoff_6m)
        .group_by(func.to_char(Tenant.created_at, "YYYY-MM"))
        .order_by(func.to_char(Tenant.created_at, "YYYY-MM"))
    )).all())
    monthly_trend = [{"month": r.month, "count": r.cnt} for r in trend_rows]

    return RevenueStats(
        mrr=mrr, arr=arr,
        paying_count=paying, trialing_count=trialing,
        past_due_count=past_due, churned_count=churned,
        growth_30d=growth_30d, monthly_trend=monthly_trend,
    )


# ── Tenant users ──────────────────────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/users", response_model=list[UserWithTenant])
async def get_tenant_users(tenant_id: UUID, db: AsyncSession = Depends(get_db)) -> list[UserWithTenant]:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    users = list((await db.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.created_at.desc())
    )).scalars().all())
    return [UserWithTenant(
        id=u.id, username=u.username, role=u.role, is_active=u.is_active,
        created_at=u.created_at, tenant_id=u.tenant_id, tenant_name=tenant.name,
    ) for u in users]


# ── Support notes ─────────────────────────────────────────────────────────────

class StaffNoteOut(BaseModel):
    id: UUID
    tenant_id: UUID
    author_username: str
    body: str
    created_at: datetime
    model_config = {"from_attributes": True}


class StaffNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.get("/tenants/{tenant_id}/notes", response_model=list[StaffNoteOut])
async def get_tenant_notes(tenant_id: UUID, db: AsyncSession = Depends(get_db)) -> list[StaffNoteOut]:
    notes = list((await db.execute(
        select(StaffNote).where(StaffNote.tenant_id == tenant_id).order_by(StaffNote.created_at.desc())
    )).scalars().all())
    return [StaffNoteOut.model_validate(n) for n in notes]


@router.post("/tenants/{tenant_id}/notes", response_model=StaffNoteOut, status_code=status.HTTP_201_CREATED)
async def add_tenant_note(
    tenant_id: UUID,
    body: StaffNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StaffNoteOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    note = StaffNote(tenant_id=tenant_id, author_username=current_user.username, body=body.body)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return StaffNoteOut.model_validate(note)


@router.delete("/tenants/{tenant_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_note(tenant_id: UUID, note_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    note = (await db.execute(
        select(StaffNote).where(StaffNote.id == note_id, StaffNote.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    await db.delete(note)
    await db.commit()


# ── Announcements ─────────────────────────────────────────────────────────────

class AnnouncementOut(BaseModel):
    id: UUID
    title: str
    body: str
    severity: str
    is_active: bool
    created_by: str
    created_at: datetime
    model_config = {"from_attributes": True}


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    body: str = Field(min_length=1, max_length=8000)
    severity: str = Field(default="info", pattern=r"^(info|warning|critical)$")


class AnnouncementToggle(BaseModel):
    is_active: bool


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(db: AsyncSession = Depends(get_db)) -> list[AnnouncementOut]:
    rows = list((await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc())
    )).scalars().all())
    return [AnnouncementOut.model_validate(r) for r in rows]


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementOut:
    ann = Announcement(title=body.title, body=body.body, severity=body.severity, created_by=current_user.username)
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@router.patch("/announcements/{ann_id}", response_model=AnnouncementOut)
async def toggle_announcement(ann_id: UUID, body: AnnouncementToggle, db: AsyncSession = Depends(get_db)) -> AnnouncementOut:
    ann = (await db.execute(select(Announcement).where(Announcement.id == ann_id))).scalar_one_or_none()
    if not ann:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    ann.is_active = body.is_active
    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@router.delete("/announcements/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(ann_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    ann = (await db.execute(select(Announcement).where(Announcement.id == ann_id))).scalar_one_or_none()
    if not ann:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    await db.delete(ann)
    await db.commit()
