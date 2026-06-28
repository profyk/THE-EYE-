from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import check_rate_limit
from app.core.request_utils import get_client_ip
from app.core.security import hash_api_key
from app.db.session import get_db
from app.models.ingestion_source import IngestionSource
from app.models.user import User
from app.services.intrusion_service import log_failed_ingestion_attempt
from app.services.source_service import get_source_by_key_hash, touch_last_seen
from app.services.tenant_service import get_tenant_by_id
from app.services.user_service import get_user_by_session_token

__all__ = [
    "get_db",
    "get_current_source",
    "get_current_user",
    "require_role",
    "resolve_tenant_id",
    "require_tenant_id",
]

# Logging a rejected ingestion attempt is expensive: a GeoIP network call plus
# a ledger write that holds the global chain-head lock. Without a cap, a flood
# of bad keys from one source becomes an amplified DoS against legitimate
# ingestion (lock contention) and the GeoIP provider, even though each
# individual request still gets a fast 401 either way.
INGESTION_FAILURE_LOG_MAX_REQUESTS = 30
INGESTION_FAILURE_LOG_WINDOW_SECONDS = 300


async def get_current_source(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> IngestionSource:
    client_ip = get_client_ip(request)
    should_log_failure = check_rate_limit(
        f"ingestion_failure:{client_ip or 'unknown'}",
        max_requests=INGESTION_FAILURE_LOG_MAX_REQUESTS,
        window_seconds=INGESTION_FAILURE_LOG_WINDOW_SECONDS,
    )

    if not authorization or not authorization.startswith("Bearer "):
        if should_log_failure:
            await log_failed_ingestion_attempt(db, client_ip=client_ip, reason="missing_or_malformed_header")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or malformed Authorization header")

    raw_key = authorization.removeprefix("Bearer ").strip()
    key_hash = hash_api_key(raw_key)
    source = await get_source_by_key_hash(db, key_hash)

    if source is None or not source.is_active:
        # Real intrusion-detection signal (Phase 3): every rejected ingestion
        # key is now a real ledger event with a real IP, not just a 401 that
        # vanishes. Never log the attempted key itself, even its hash --
        # there's no legitimate reason to retain that. Throttled above so a
        # flood of bad keys can't be used to hammer the ledger or GeoIP.
        if should_log_failure:
            await log_failed_ingestion_attempt(db, client_ip=client_ip, reason="invalid_or_inactive_key")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or inactive API key")

    await touch_last_seen(db, source.id)
    return source


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Real per-user session auth (Phase 2A) -- replaces the old single
    shared ADMIN_AUTH_TOKEN. Every dashboard/admin endpoint depends on this
    (directly or via require_role) instead of a static token check. The
    session token lives in an httpOnly cookie (set by /v1/auth/login), not a
    bearer header -- it's never readable by frontend JS, only sent
    automatically by the browser."""
    raw_token = request.cookies.get("session_token")
    if not raw_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    user = await get_user_by_session_token(db, raw_token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    # Block tenant-scoped users whose subscription has lapsed.
    # platform_admin has no tenant and is never blocked here.
    if user.tenant_id is not None:
        tenant = await get_tenant_by_id(db, user.tenant_id)
        if tenant is not None and not tenant.is_active:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "Subscription inactive — please renew your plan to continue.",
            )

    return user


def require_role(*allowed_roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action")
        return user

    return _check


async def resolve_tenant_id(
    tenant_id: UUID | None = Query(
        default=None, description="Which tenant to view -- only meaningful for platform_admin"
    ),
    user: User = Depends(get_current_user),
) -> UUID | None:
    """Every regular (tenant-scoped) user always gets their own tenant_id --
    the query param is silently ignored for them, so there's no way to use it
    to peek at another tenant's data. platform_admin has no tenant_id of
    their own, so they must supply ?tenant_id= to pick one; returning None
    here means "no tenant selected", which callers that allow a genuine
    cross-tenant list (e.g. listing all tenants' users) can treat as
    "don't filter". Callers that always need exactly one tenant should use
    require_tenant_id instead."""
    if user.role == "platform_admin":
        return tenant_id
    return user.tenant_id


async def require_tenant_id(
    tenant_id: UUID | None = Depends(resolve_tenant_id),
) -> UUID:
    """Use in routes where an unscoped, all-tenants-merged view never makes
    sense (events, stats, alerts, intrusion, network) -- forces platform_admin
    to pick one tenant via ?tenant_id=, with a clear 400 instead of silently
    returning an empty or mixed result."""
    if tenant_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "tenant_id query parameter is required for platform_admin")
    return tenant_id
