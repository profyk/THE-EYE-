from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.models.ledger_event import DEFAULT_TENANT_ID
from app.models.session import Session
from app.models.user import User
from app.schemas.user import UserCreate


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    # platform_admin is the only role allowed no tenant at all (see
    # ck_users_tenant_required_unless_platform_admin); every other role falls
    # back to the bootstrap tenant if the caller doesn't specify one, so
    # existing call sites that predate multi-tenancy keep working unchanged.
    tenant_id = data.tenant_id
    if tenant_id is None and data.role != "platform_admin":
        tenant_id = DEFAULT_TENANT_ID

    password_hash, salt = hash_password(data.password)
    user = User(
        tenant_id=tenant_id,
        username=data.username,
        password_hash=password_hash,
        password_salt=salt,
        role=data.role,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()


# Fixed dummy salt/hash, computed once at import time. authenticate_user runs
# verify_password against this for unknown usernames so response time doesn't
# leak whether a username exists -- without it, a real username pays the full
# scrypt cost while an unknown one returns instantly.
_DUMMY_PASSWORD_HASH, _DUMMY_PASSWORD_SALT = hash_password("not-a-real-password", salt=bytes(16))


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    user = await get_user_by_username(db, username)
    if user is None or not user.is_active:
        verify_password(password, _DUMMY_PASSWORD_HASH, _DUMMY_PASSWORD_SALT)
        return None
    if not verify_password(password, user.password_hash, user.password_salt):
        return None
    return user


async def set_user_password(db: AsyncSession, user: User, new_password: str) -> User:
    password_hash, salt = hash_password(new_password)
    user.password_hash = password_hash
    user.password_salt = salt
    await db.commit()
    await db.refresh(user)
    return user


async def create_session(db: AsyncSession, user: User) -> str:
    raw_token = generate_session_token()
    now = datetime.now(timezone.utc)
    session = Session(
        user_id=user.id,
        token_hash=hash_session_token(raw_token),
        created_at=now,
        expires_at=now + timedelta(hours=settings.session_token_ttl_hours),
    )
    db.add(session)
    await db.commit()
    return raw_token


async def get_user_by_session_token(db: AsyncSession, raw_token: str) -> User | None:
    token_hash = hash_session_token(raw_token)
    session = (
        await db.execute(select(Session).where(Session.token_hash == token_hash))
    ).scalar_one_or_none()
    if session is None:
        return None

    now = datetime.now(timezone.utc)
    expires_at = session.expires_at if session.expires_at.tzinfo else session.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None

    session.last_seen_at = now
    await db.commit()

    user = (await db.execute(select(User).where(User.id == session.user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user


async def get_user_by_id(db: AsyncSession, user_id: UUID, *, tenant_id: UUID | None = None) -> User | None:
    """tenant_id=None is only safe for internal/system call sites (e.g.
    resolving the session's own user during auth) that already have another
    way of establishing trust -- any caller acting on a *different* user's
    record (admin endpoints) must always pass their own tenant_id."""
    stmt = select(User).where(User.id == user_id)
    if tenant_id is not None:
        stmt = stmt.where(User.tenant_id == tenant_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def delete_session_by_token(db: AsyncSession, raw_token: str) -> None:
    token_hash = hash_session_token(raw_token)
    session = (
        await db.execute(select(Session).where(Session.token_hash == token_hash))
    ).scalar_one_or_none()
    if session is None:
        return
    await db.delete(session)
    await db.commit()


async def deactivate_user(db: AsyncSession, user_id: UUID, *, tenant_id: UUID) -> User | None:
    user = (
        await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if user is None:
        return None
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(db: AsyncSession, *, tenant_id: UUID | None) -> list[User]:
    """tenant_id=None means "don't scope" -- only valid for a platform_admin
    caller (the router enforces that), everyone else always passes their own
    tenant_id."""
    stmt = select(User).order_by(User.created_at.desc())
    if tenant_id is not None:
        stmt = stmt.where(User.tenant_id == tenant_id)
    return list((await db.execute(stmt)).scalars().all())
