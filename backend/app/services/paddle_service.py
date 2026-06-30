"""Paddle Billing webhook verification, checkout, and subscription event handling."""
import hashlib
import hmac
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tenant import Tenant

PADDLE_API_BASE = {
    "production": "https://api.paddle.com",
    "sandbox": "https://sandbox-api.paddle.com",
}


def _base_url() -> str:
    return PADDLE_API_BASE.get(settings.paddle_environment, PADDLE_API_BASE["sandbox"])


def _api_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.paddle_api_key}",
        "Content-Type": "application/json",
    }


async def create_checkout_transaction(
    price_id: str,
    customer_email: str | None = None,
    custom_data: dict | None = None,
) -> dict:
    """Create a Paddle transaction and return its data (includes checkout.url)."""
    payload: dict = {"items": [{"price_id": price_id, "quantity": 1}]}
    if customer_email:
        payload["customer"] = {"email": customer_email}
    if custom_data:
        payload["custom_data"] = custom_data
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{_base_url()}/transactions",
            headers=_api_headers(),
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["data"]


async def cancel_subscription(subscription_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{_base_url()}/subscriptions/{subscription_id}/cancel",
            headers=_api_headers(),
            json={"effective_from": "next_billing_period"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["data"]

# Paddle events that mean the subscription is live/paying.
_ACTIVE_EVENTS = {"subscription.activated", "subscription.resumed", "subscription.trialing"}
# Paddle events that mean access should be revoked.
_INACTIVE_EVENTS = {"subscription.canceled", "subscription.paused"}
# subscription.past_due: Paddle retries automatically for several days before
# canceling -- we don't block immediately so clients aren't surprised by a
# one-day payment hiccup. Paddle will fire subscription.canceled if retries
# are exhausted, which does block.


def verify_paddle_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Paddle Billing webhook HMAC-SHA256 signature.

    Header format: Paddle-Signature: ts=<epoch>;h1=<hex-hmac>
    Signed payload: "<ts>:<raw_body_utf8>"
    """
    if not signature_header or not secret:
        return False
    try:
        parts = dict(part.split("=", 1) for part in signature_header.split(";"))
        ts = parts.get("ts", "")
        h1 = parts.get("h1", "")
    except ValueError:
        return False

    signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
    expected = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, h1)


async def handle_paddle_event(db: AsyncSession, event: dict[str, Any]) -> None:
    event_type: str = event.get("event_type", "")
    data: dict[str, Any] = event.get("data", {})

    if not event_type.startswith("subscription."):
        return

    subscription_id: str | None = data.get("id")
    customer_id: str | None = data.get("customer_id")
    status: str | None = data.get("status")
    custom_data: dict[str, Any] = data.get("custom_data") or {}
    tenant_id_str: str | None = custom_data.get("tenant_id")

    tenant = await _find_tenant(db, subscription_id=subscription_id, tenant_id_str=tenant_id_str)
    if tenant is None:
        return

    if subscription_id:
        tenant.paddle_subscription_id = subscription_id
    if customer_id:
        tenant.paddle_customer_id = customer_id
    if status:
        tenant.paddle_subscription_status = status

    if event_type in _ACTIVE_EVENTS:
        tenant.is_active = True
    elif event_type in _INACTIVE_EVENTS:
        tenant.is_active = False

    await db.commit()


async def _find_tenant(
    db: AsyncSession,
    *,
    subscription_id: str | None,
    tenant_id_str: str | None,
) -> Tenant | None:
    # After first activation the subscription_id is stored; use it for
    # all subsequent events so we don't rely on custom_data being present.
    if subscription_id:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.paddle_subscription_id == subscription_id))
        ).scalar_one_or_none()
        if tenant:
            return tenant

    # First activation: custom_data carries the tenant_id we set at checkout.
    if tenant_id_str:
        try:
            tid = UUID(tenant_id_str)
            return (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one_or_none()
        except ValueError:
            return None

    return None
