import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.core.rate_limit import check_rate_limit
from app.core.request_utils import get_client_ip
from app.ledger.append import append_event
from app.models.ledger_event import DEFAULT_TENANT_ID
from app.schemas.event import EventCreate
from app.schemas.user import LoginRequest, LoginResponse
from app.services.geoip_service import lookup_geoip
from app.services.source_service import get_source_by_name
from app.services.user_service import authenticate_user, create_session, delete_session_by_token, get_user_by_username, get_user_by_session_token

router = APIRouter(prefix="/v1/auth", tags=["auth"])

PLATFORM_SOURCE_NAME = "the-eye-platform"
SESSION_COOKIE_NAME = "session_token"

# Two independent limits: per-IP guards against spraying many usernames from
# one source, per-username guards against many sources hammering one account.
IP_RATE_LIMIT_MAX_REQUESTS = 20
IP_RATE_LIMIT_WINDOW_SECONDS = 900
USERNAME_RATE_LIMIT_MAX_REQUESTS = 8
USERNAME_RATE_LIMIT_WINDOW_SECONDS = 900


async def _log_dashboard_login(
    db: AsyncSession, *, username: str, outcome: str, client_ip: str | None, tenant_id: UUID
) -> None:
    """Every dashboard login attempt -- success or failure -- becomes a real
    ledger event. This is the literal data backing the access-log dashboard:
    no separate logging system, just the same immutable audit trail
    everything else in this app writes to."""
    source = await get_source_by_name(db, PLATFORM_SOURCE_NAME)
    if source is None:
        # Seeded by migration 0009; if it's missing, something is badly wrong
        # with the schema setup, but a missing audit log entry should never
        # be the reason a login itself fails.
        return

    geo = await asyncio.to_thread(lookup_geoip, client_ip) if client_ip else None

    event = EventCreate(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id=username,
        event_type="auth.dashboard_login",
        event_category="authentication",
        outcome=outcome,
        origin_ip=client_ip,
        metadata={"geo": geo} if geo else {},
    )
    await append_event(db, event, source_id=source.id, tenant_id=tenant_id)
    await db.commit()


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> LoginResponse:
    client_ip = get_client_ip(request, trust_proxy=settings.trust_proxy_headers)

    if not check_rate_limit(
        f"login_ip:{client_ip}", max_requests=IP_RATE_LIMIT_MAX_REQUESTS, window_seconds=IP_RATE_LIMIT_WINDOW_SECONDS
    ) or not check_rate_limit(
        f"login_user:{body.username.lower()}",
        max_requests=USERNAME_RATE_LIMIT_MAX_REQUESTS,
        window_seconds=USERNAME_RATE_LIMIT_WINDOW_SECONDS,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts -- please try again later.")

    user = await authenticate_user(db, body.username, body.password)

    # Attribute the attempt to a real tenant whenever possible, even on a
    # failed attempt -- a wrong-password attempt against a real username
    # still tells that business owner something about their own org. An
    # unknown username has no tenant to attribute it to (honest limitation:
    # there's no way to know who an attacker was *trying* to be), so it falls
    # back to the bootstrap tenant rather than inventing an attribution.
    if user is not None:
        login_tenant_id = user.tenant_id or DEFAULT_TENANT_ID
    else:
        existing = await get_user_by_username(db, body.username)
        login_tenant_id = (existing.tenant_id if existing else None) or DEFAULT_TENANT_ID

    await _log_dashboard_login(
        db,
        username=body.username,
        outcome="success" if user else "failure",
        client_ip=client_ip,
        tenant_id=login_tenant_id,
    )

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    token = await create_session(db, user)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_token_ttl_hours * 3600,
        path="/",
    )
    return LoginResponse(username=user.username, role=user.role, tenant_id=user.tenant_id)


@router.get("/me", response_model=LoginResponse)
async def me(request: Request, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user = await get_user_by_session_token(db, raw_token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return LoginResponse(username=user.username, role=user.role, tenant_id=user.tenant_id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> None:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if raw_token:
        await delete_session_by_token(db, raw_token)
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
