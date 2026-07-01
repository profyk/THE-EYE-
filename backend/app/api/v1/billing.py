"""Client billing endpoints.

GET  /v1/billing/plans        — public plan listing (no auth)
GET  /v1/billing/subscription — current tenant subscription (session auth)
POST /v1/billing/checkout     — create Paddle checkout (session auth)
POST /v1/billing/webhook      — Paddle webhook (HMAC-verified, no auth)
"""
import json
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models.plan import Plan
from app.models.tenant import Tenant
from app.models.user import User
from app.services.paddle_service import (
    create_checkout_transaction,
    handle_paddle_event,
    verify_paddle_signature,
)

router = APIRouter(prefix="/v1/billing", tags=["billing"])


# ── schemas ───────────────────────────────────────────────────────────────────

class PlanOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    price_monthly: float | None
    price_annual: float | None
    currency: str
    features: list[str] | None
    limits: dict | None
    is_public: bool
    sort_order: int
    has_paddle: bool
    paddle_price_id_monthly: str | None = None
    paddle_price_id_annual: str | None = None

    model_config = {"from_attributes": True}


class SubscriptionOut(BaseModel):
    tenant_id: str
    tenant_name: str
    plan: PlanOut | None
    paddle_subscription_id: str | None
    paddle_subscription_status: str | None
    paddle_customer_id: str | None


class CheckoutRequest(BaseModel):
    plan_id: uuid.UUID
    billing_cycle: str = "monthly"


class CheckoutResponse(BaseModel):
    checkout_url: str | None = None
    transaction_id: str | None = None
    contact_sales: bool = False
    message: str = ""


# ── helpers ───────────────────────────────────────────────────────────────────

def _plan_out(p: Plan) -> PlanOut:
    return PlanOut(
        id=p.id,
        name=p.name,
        slug=p.slug,
        description=p.description,
        price_monthly=float(p.price_monthly) if p.price_monthly else None,
        price_annual=float(p.price_annual) if p.price_annual else None,
        currency=p.currency,
        features=p.features,
        limits=p.limits,
        is_public=p.is_public,
        sort_order=p.sort_order,
        has_paddle=bool(p.paddle_price_id_monthly or p.paddle_price_id_annual),
        paddle_price_id_monthly=p.paddle_price_id_monthly,
        paddle_price_id_annual=p.paddle_price_id_annual,
    )


def _require_tenant(current_user: User) -> None:
    if not current_user.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tenant associated with account.")


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanOut])
async def list_plans(db: AsyncSession = Depends(get_db)) -> list[PlanOut]:
    """Public — no auth required."""
    plans = list(
        (
            await db.execute(
                select(Plan)
                .where(Plan.is_active == True, Plan.is_public == True)
                .order_by(Plan.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [_plan_out(p) for p in plans]


@router.get("/subscription", response_model=SubscriptionOut)
async def get_tenant_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    _require_tenant(current_user)
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    return SubscriptionOut(
        tenant_id=str(tenant.id),
        tenant_name=tenant.name,
        plan=_plan_out(tenant.plan) if tenant.plan else None,
        paddle_subscription_id=tenant.paddle_subscription_id,
        paddle_subscription_status=tenant.paddle_subscription_status,
        paddle_customer_id=tenant.paddle_customer_id,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    data: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutResponse:
    _require_tenant(current_user)

    plan = (
        await db.execute(
            select(Plan).where(Plan.id == data.plan_id, Plan.is_active == True)
        )
    ).scalar_one_or_none()
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")

    if not plan.price_monthly and not plan.price_annual:
        return CheckoutResponse(
            contact_sales=True,
            message="Contact our sales team to set up an Enterprise plan.",
        )

    if not settings.paddle_api_key:
        return CheckoutResponse(
            contact_sales=True,
            message="Payment processing is being configured. Please contact support.",
        )

    price_id = (
        plan.paddle_price_id_annual
        if data.billing_cycle == "annual"
        else plan.paddle_price_id_monthly
    )
    if not price_id:
        return CheckoutResponse(
            contact_sales=True,
            message=f"No {data.billing_cycle} pricing configured for this plan yet.",
        )

    try:
        txn = await create_checkout_transaction(
            price_id=price_id,
            customer_email=current_user.username if "@" in current_user.username else None,
            custom_data={"tenant_id": str(current_user.tenant_id), "plan_id": str(plan.id)},
        )
        checkout_url = txn.get("checkout", {}).get("url")
        return CheckoutResponse(checkout_url=checkout_url, transaction_id=txn.get("id"))
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Paddle error: {exc}")


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def paddle_webhook(
    request: Request,
    paddle_signature: str | None = Header(default=None, alias="Paddle-Signature"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_body = await request.body()

    if settings.paddle_webhook_secret and paddle_signature:
        if not verify_paddle_signature(raw_body, paddle_signature, settings.paddle_webhook_secret):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature.")

    try:
        event = json.loads(raw_body)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.")

    # Update plan_id from custom_data if present, then delegate to service
    event_type = event.get("event_type", "")
    data = event.get("data", {})
    custom_data = data.get("custom_data") or {}
    plan_id_str = custom_data.get("plan_id")
    tenant_id_str = custom_data.get("tenant_id")

    await handle_paddle_event(db, event)

    # Also update plan_id if provided in custom_data
    if plan_id_str and tenant_id_str and event_type.startswith("subscription."):
        try:
            tid = uuid.UUID(tenant_id_str)
            pid = uuid.UUID(plan_id_str)
            tenant = (
                await db.execute(select(Tenant).where(Tenant.id == tid))
            ).scalar_one_or_none()
            if tenant and tenant.plan_id != pid:
                tenant.plan_id = pid
                await db.commit()
        except (ValueError, Exception):
            pass

    return {"ok": True, "event_type": event_type}


# ── Paddle client config (public) ─────────────────────────────────────────────

@router.get("/config")
async def get_billing_config() -> dict:
    """Returns Paddle.js client token and environment. Safe to expose — client
    token is not the API key and cannot make server-side Paddle API calls."""
    return {
        "client_token": settings.paddle_client_token,
        "environment": settings.paddle_environment,
    }


# ── Tenant profile ─────────────────────────────────────────────────────────────

class TenantProfileOut(BaseModel):
    id: str
    name: str
    slug: str
    contact_email: str | None
    phone: str | None
    website: str | None
    country: str | None
    industry: str | None
    logo_url: str | None
    profile_description: str | None
    pending_deletion: bool = False
    deletion_requested_at: str | None = None
    deletion_reason: str | None = None


class TenantProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=256)
    phone: str | None = Field(default=None, max_length=64)
    website: str | None = Field(default=None, max_length=256)
    country: str | None = Field(default=None, max_length=64)
    industry: str | None = Field(default=None, max_length=128)
    logo_url: str | None = Field(default=None, max_length=512)
    profile_description: str | None = None


@router.get("/profile", response_model=TenantProfileOut)
async def get_tenant_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantProfileOut:
    _require_tenant(current_user)
    tenant = (await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    return TenantProfileOut(
        id=str(tenant.id), name=tenant.name, slug=tenant.slug,
        contact_email=tenant.contact_email, phone=tenant.phone,
        website=tenant.website, country=tenant.country,
        industry=tenant.industry, logo_url=tenant.logo_url,
        profile_description=tenant.profile_description,
        pending_deletion=tenant.pending_deletion,
        deletion_requested_at=tenant.deletion_requested_at.isoformat() if tenant.deletion_requested_at else None,
        deletion_reason=tenant.deletion_reason,
    )


@router.patch("/profile", response_model=TenantProfileOut)
async def update_tenant_profile(
    data: TenantProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantProfileOut:
    if current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required.")
    _require_tenant(current_user)
    tenant = (await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(tenant, field, val)
    await db.commit()
    await db.refresh(tenant)
    return TenantProfileOut(
        id=str(tenant.id), name=tenant.name, slug=tenant.slug,
        contact_email=tenant.contact_email, phone=tenant.phone,
        website=tenant.website, country=tenant.country,
        industry=tenant.industry, logo_url=tenant.logo_url,
        profile_description=tenant.profile_description,
        pending_deletion=tenant.pending_deletion,
        deletion_requested_at=tenant.deletion_requested_at.isoformat() if tenant.deletion_requested_at else None,
        deletion_reason=tenant.deletion_reason,
    )
