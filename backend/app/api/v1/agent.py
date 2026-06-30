"""THE EYE Agent API.

Machine agents authenticate with X-Tenant-ID + X-Api-Key headers.
All endpoints here bypass session-cookie auth and use API key auth instead,
except /machines-portal which uses session auth for the client portal.
"""
import hashlib
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import and_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.api_key import ApiKey
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/v1/agent", tags=["agent"])

# ── Auth helper ───────────────────────────────────────────────────────────────

async def _resolve_tenant(
    x_tenant_id: str | None,
    x_api_key: str | None,
    db: AsyncSession,
) -> Tenant:
    if not x_tenant_id or not x_api_key:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing X-Tenant-ID or X-Api-Key headers.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    try:
        tid = uuid.UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid X-Tenant-ID format (must be UUID)."
        )

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == tid))
    ).scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Tenant not found or inactive."
        )

    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    key = (
        await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == key_hash,
                ApiKey.tenant_id == tid,
                ApiKey.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if key is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or revoked API key."
        )

    if key.expires_at and key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key has expired.")

    await db.execute(
        text("UPDATE app.api_keys SET last_used_at = NOW() WHERE id = :id"),
        {"id": key.id},
    )
    await db.commit()

    return tenant


# ── IP helper ─────────────────────────────────────────────────────────────────

def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentVerifyResponse(BaseModel):
    ok: bool
    tenant_id: str
    tenant_name: str
    tenant_slug: str


class RegisterRequest(BaseModel):
    machine_id: str
    hostname: str = "unknown"
    os: str | None = None
    agent_version: str | None = None
    agent_label: str | None = None


class HeartbeatRequest(BaseModel):
    machine_id: str


class AgentEventIn(BaseModel):
    occurred_at: str | None = None
    event_type: str
    event_category: str = "system"
    outcome: str = "success"
    severity: str = "info"
    actor_type: str | None = None
    actor_id: str | None = None
    origin_ip: str | None = None
    metadata: dict | None = None


class EventsBatchRequest(BaseModel):
    events: list[AgentEventIn]


class MachineOut(BaseModel):
    id: str
    machine_id: str
    hostname: str
    os: str | None
    agent_version: str | None
    agent_label: str | None
    ip_address: str | None
    last_heartbeat_at: str | None
    registered_at: str
    is_online: bool


# ── Field sanitisers for Ledger constraints ───────────────────────────────────

_VALID_ACTOR_TYPES = {"user", "service_account", "system", "unknown"}
_VALID_CATEGORIES = {
    "authentication", "authorization", "data_access", "data_modification",
    "configuration", "process_execution", "network", "financial_transaction",
    "administrative", "system",
}
_VALID_OUTCOMES = {"success", "failure", "denied", "unknown"}
_VALID_SEVERITIES = {"debug", "info", "warning", "high", "critical"}

# Maps severity labels the Windows collector may emit to ledger values.
_SEVERITY_MAP = {"warn": "warning", "critical": "critical", "error": "high"}


def _sanitise_event_type(raw: str) -> str:
    """Force event_type into the ^[a-z0-9_]+.[a-z0-9_]+$ pattern."""
    lowered = raw.lower().strip()
    # Replace any non-allowed character with underscore.
    clean = re.sub(r"[^a-z0-9_.]", "_", lowered)
    # Ensure there is exactly one dot separating two non-empty parts.
    if "." not in clean:
        clean = "agent." + clean
    parts = clean.split(".", 1)
    left = re.sub(r"[^a-z0-9_]", "_", parts[0]) or "agent"
    right = re.sub(r"[^a-z0-9_]", "_", parts[1]) or "event"
    return f"{left}.{right}"[:128]


def _get_or_create_agent_source_sync(db_sync, tenant_id: uuid.UUID):
    """Synchronous helper — not used; see async version below."""
    pass


async def _get_or_create_agent_source(db: AsyncSession, tenant_id: uuid.UUID) -> uuid.UUID:
    """Return the IngestionSource.id for this tenant's agent source,
    creating a synthetic one if it doesn't exist yet.
    The IngestionSource is purely a bookkeeping record here — agent auth
    goes through app.api_keys, not ingestion_sources."""
    from app.models.ingestion_source import IngestionSource

    # Use a deterministic pseudo-hash so we can look it up without an extra
    # index. The value is never used for real auth; it just satisfies the
    # unique-not-null constraint on api_key_hash.
    synthetic_hash = hashlib.sha256(f"__agent_source__{tenant_id}__".encode()).hexdigest()

    source = (
        await db.execute(
            select(IngestionSource).where(IngestionSource.api_key_hash == synthetic_hash)
        )
    ).scalar_one_or_none()

    if source is None:
        prefix = f"agt_{str(tenant_id).replace('-', '')[:8]}"
        source = IngestionSource(
            tenant_id=tenant_id,
            name="THE EYE Agent",
            source_kind="agent",
            api_key_hash=synthetic_hash,
            api_key_prefix=prefix,
            created_at=datetime.now(timezone.utc),
        )
        db.add(source)
        await db.flush()

    return source.id


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/verify", response_model=AgentVerifyResponse)
async def agent_verify(
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> AgentVerifyResponse:
    """Called by the agent on startup to validate credentials before running."""
    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    return AgentVerifyResponse(
        ok=True,
        tenant_id=str(tenant.id),
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
    )


@router.post("/register", status_code=status.HTTP_200_OK)
async def agent_register(
    data: RegisterRequest,
    request: Request,
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register or update a machine record. Called once on agent startup."""
    from app.models.agent_machine import AgentMachine

    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    ip = _client_ip(request)

    machine = (
        await db.execute(
            select(AgentMachine).where(
                and_(
                    AgentMachine.machine_id == data.machine_id,
                    AgentMachine.tenant_id == tenant.id,
                )
            )
        )
    ).scalar_one_or_none()

    if machine is None:
        machine = AgentMachine(
            tenant_id=tenant.id,
            machine_id=data.machine_id,
            hostname=data.hostname,
            os=data.os,
            agent_version=data.agent_version,
            agent_label=data.agent_label,
            ip_address=ip,
            last_heartbeat_at=datetime.now(timezone.utc),
        )
        db.add(machine)
    else:
        machine.hostname = data.hostname
        if data.os:
            machine.os = data.os
        if data.agent_version:
            machine.agent_version = data.agent_version
        if data.agent_label:
            machine.agent_label = data.agent_label
        if ip:
            machine.ip_address = ip
        machine.last_heartbeat_at = datetime.now(timezone.utc)

    await db.commit()
    return {"ok": True, "machine_id": data.machine_id}


@router.post("/heartbeat", status_code=status.HTTP_200_OK)
async def agent_heartbeat(
    data: HeartbeatRequest,
    request: Request,
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Lightweight ping — keeps the machine marked as online in the portal."""
    from app.models.agent_machine import AgentMachine

    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    ip = _client_ip(request)

    await db.execute(
        update(AgentMachine)
        .where(
            and_(
                AgentMachine.machine_id == data.machine_id,
                AgentMachine.tenant_id == tenant.id,
            )
        )
        .values(
            last_heartbeat_at=datetime.now(timezone.utc),
            **({"ip_address": ip} if ip else {}),
        )
    )
    await db.commit()
    return {"ok": True}


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def agent_ingest_events(
    data: EventsBatchRequest,
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Accept a batch of events from the agent and append to the hash-chained ledger."""
    from app.ledger.append import append_event
    from app.schemas.event import EventCreate

    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    source_id = await _get_or_create_agent_source(db, tenant.id)

    ingested = 0
    for ev in data.events[:500]:  # cap per batch
        try:
            occurred = (
                datetime.fromisoformat(ev.occurred_at.replace("Z", "+00:00"))
                if ev.occurred_at
                else datetime.now(timezone.utc)
            )
        except Exception:
            occurred = datetime.now(timezone.utc)

        # Sanitise to EventCreate constraints.
        actor_type = ev.actor_type if ev.actor_type in _VALID_ACTOR_TYPES else "system"
        category = ev.event_category if ev.event_category in _VALID_CATEGORIES else "system"
        outcome = ev.outcome if ev.outcome in _VALID_OUTCOMES else "unknown"
        raw_sev = _SEVERITY_MAP.get(ev.severity, ev.severity)
        severity = raw_sev if raw_sev in _VALID_SEVERITIES else "info"
        event_type = _sanitise_event_type(ev.event_type)
        actor_id = (ev.actor_id or "agent")[:256] or "agent"
        metadata = {k: v for k, v in (ev.metadata or {}).items()} if ev.metadata else {}

        try:
            event_create = EventCreate(
                occurred_at=occurred,
                actor_type=actor_type,
                actor_id=actor_id,
                event_type=event_type,
                event_category=category,
                outcome=outcome,
                severity=severity,
                origin_ip=ev.origin_ip if ev.origin_ip else None,
                metadata=metadata,
            )
            await append_event(db, event_create, source_id=source_id, tenant_id=tenant.id)
            ingested += 1
        except Exception:
            # Skip invalid individual events without aborting the batch.
            continue

    await db.commit()
    return {"ok": True, "ingested": ingested}


@router.get("/machines", response_model=list[MachineOut])
async def list_machines_by_key(
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> list[MachineOut]:
    """List all machines for this tenant (API key auth — for direct agent/API use)."""
    from app.models.agent_machine import AgentMachine

    tenant = await _resolve_tenant(x_tenant_id, x_api_key, db)
    return await _build_machine_list(db, tenant.id)


@router.get("/machines-portal", response_model=list[MachineOut])
async def list_machines_portal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MachineOut]:
    """List machines for the logged-in user's tenant (session auth — for client portal)."""
    if not current_user.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tenant associated.")
    return await _build_machine_list(db, current_user.tenant_id)


async def _build_machine_list(db: AsyncSession, tenant_id: uuid.UUID) -> list[MachineOut]:
    from app.models.agent_machine import AgentMachine

    machines = list(
        (
            await db.execute(
                select(AgentMachine)
                .where(AgentMachine.tenant_id == tenant_id, AgentMachine.is_active.is_(True))
                .order_by(AgentMachine.last_heartbeat_at.desc().nullslast())
            )
        )
        .scalars()
        .all()
    )

    now = datetime.now(timezone.utc)
    return [
        MachineOut(
            id=str(m.id),
            machine_id=m.machine_id,
            hostname=m.hostname,
            os=m.os,
            agent_version=m.agent_version,
            agent_label=m.agent_label,
            ip_address=m.ip_address,
            last_heartbeat_at=m.last_heartbeat_at.isoformat() if m.last_heartbeat_at else None,
            registered_at=m.registered_at.isoformat(),
            is_online=(
                m.last_heartbeat_at is not None
                and (now - m.last_heartbeat_at).total_seconds() < 120
            ),
        )
        for m in machines
    ]
