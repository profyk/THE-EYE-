from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_api_key, hash_api_key, key_display_prefix
from app.models.ingestion_source import IngestionSource
from app.models.ledger_event import DEFAULT_TENANT_ID
from app.schemas.source import SourceCreate, SourceCreated


async def create_source(db: AsyncSession, data: SourceCreate, *, tenant_id: UUID | None = None) -> SourceCreated:
    # tenant_id always comes from the authenticated caller's own session
    # (never from client-supplied request data -- that would let a caller
    # assign a source, and therefore every event it ever submits, to a
    # different tenant). Defaults to the bootstrap tenant for internal
    # system sources created before multi-tenancy (see scripts and migration
    # 0009's seeded platform source).
    raw_key = generate_api_key()
    source = IngestionSource(
        tenant_id=tenant_id or DEFAULT_TENANT_ID,
        name=data.name,
        source_kind=data.source_kind,
        api_key_hash=hash_api_key(raw_key),
        api_key_prefix=key_display_prefix(raw_key),
        created_at=datetime.now(timezone.utc),
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    return SourceCreated(
        id=source.id,
        name=source.name,
        source_kind=source.source_kind,
        api_key=raw_key,
        api_key_prefix=source.api_key_prefix,
    )


async def get_source_by_key_hash(db: AsyncSession, key_hash: str) -> IngestionSource | None:
    return (
        await db.execute(select(IngestionSource).where(IngestionSource.api_key_hash == key_hash))
    ).scalar_one_or_none()


async def get_source_by_name(db: AsyncSession, name: str) -> IngestionSource | None:
    """Looks up one of the seeded internal system sources (e.g.
    'the-eye-platform') by name. These are never authenticated via API key --
    internal code paths append events with this source_id directly."""
    return (
        await db.execute(select(IngestionSource).where(IngestionSource.name == name))
    ).scalar_one_or_none()


async def touch_last_seen(db: AsyncSession, source_id) -> None:
    await db.execute(
        update(IngestionSource)
        .where(IngestionSource.id == source_id)
        .values(last_seen_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def list_sources(db: AsyncSession, *, tenant_id: UUID | None) -> list[IngestionSource]:
    """tenant_id=None means "don't scope" -- only valid for a platform_admin
    caller, everyone else always passes their own tenant_id."""
    stmt = select(IngestionSource).order_by(IngestionSource.created_at.desc())
    if tenant_id is not None:
        stmt = stmt.where(IngestionSource.tenant_id == tenant_id)
    return list((await db.execute(stmt)).scalars().all())


async def deactivate_source(db: AsyncSession, source_id, *, tenant_id: UUID) -> IngestionSource | None:
    source = (
        await db.execute(
            select(IngestionSource).where(IngestionSource.id == source_id, IngestionSource.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if source is None:
        return None
    source.is_active = False
    await db.commit()
    await db.refresh(source)
    return source
