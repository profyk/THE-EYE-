import hashlib
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.core.rate_limit import check_rate_limit
from app.ledger.append import append_event
from app.models.whistleblower_report import WhistleblowerReport
from app.schemas.event import EventCreate
from app.schemas.whistleblower import WhistleblowerAck, WhistleblowerReportRead, WhistleblowerSubmission
from app.services.source_service import get_source_by_name

router = APIRouter(prefix="/v1/whistleblower", tags=["whistleblower"])

WHISTLEBLOWER_SOURCE_NAME = "whistleblower-portal"
RATE_LIMIT_MAX_REQUESTS = 5
RATE_LIMIT_WINDOW_SECONDS = 3600


@router.post("", response_model=WhistleblowerAck, status_code=status.HTTP_201_CREATED)
async def submit_whistleblower_report(
    body: WhistleblowerSubmission,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> WhistleblowerAck:
    """Public, unauthenticated, deliberately anonymous. Unlike every other
    write path in this app, this one does NOT call get_client_ip or any GeoIP
    lookup -- anonymity is the entire point of this endpoint, not an
    oversight. Rate-limited per source IP only to deter abuse; that IP is
    used in-memory for the rate-limit check and is never stored anywhere."""
    client_host = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_host, max_requests=RATE_LIMIT_MAX_REQUESTS, window_seconds=RATE_LIMIT_WINDOW_SECONDS):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many submissions -- please try again later.")

    source = await get_source_by_name(db, WHISTLEBLOWER_SOURCE_NAME)
    if source is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Whistleblower portal is not available.")

    now = datetime.now(timezone.utc)
    report = WhistleblowerReport(category=body.category, report_text=body.report, created_at=now)
    db.add(report)
    await db.flush()  # assigns report.id without committing yet

    # The immutable ledger gets only an id + content hash, never the raw report
    # text -- it lives in app.whistleblower_reports instead, a plain table that
    # can be redacted later without breaking the hash chain. This keeps the
    # ledger's tamper-evidence claim ("a report with exactly this content was
    # filed at this time") while honoring the "never store message content in
    # the ledger" boundary the rest of this app enforces in request validation.
    report_sha256 = hashlib.sha256(body.report.encode("utf-8")).hexdigest()
    event = EventCreate(
        occurred_at=now,
        actor_type="unknown",
        actor_id="anonymous",
        event_type="whistleblower.report_submitted",
        event_category="administrative",
        outcome="success",
        metadata={"report_id": str(report.id), "category": body.category, "report_sha256": report_sha256},
    )
    await append_event(db, event, source_id=source.id)
    await db.commit()

    return WhistleblowerAck()


@router.get(
    "/reports",
    response_model=list[WhistleblowerReportRead],
    dependencies=[Depends(require_role("admin", "investigator"))],
)
async def list_whistleblower_reports(db: AsyncSession = Depends(get_db)) -> list[WhistleblowerReportRead]:
    rows = (await db.execute(select(WhistleblowerReport).order_by(WhistleblowerReport.created_at.desc()))).scalars().all()
    return [WhistleblowerReportRead.model_validate(r) for r in rows]


@router.get(
    "/reports/{report_id}",
    response_model=WhistleblowerReportRead,
    dependencies=[Depends(require_role("admin", "investigator"))],
)
async def get_whistleblower_report(report_id: UUID, db: AsyncSession = Depends(get_db)) -> WhistleblowerReportRead:
    # Known Phase 1 gap, not an oversight: WhistleblowerReport has no
    # tenant_id (the public submission form has no tenant selector yet --
    # that's a frontend addition for a later phase), so this can't be
    # tenant-scoped without first deciding how an anonymous, unauthenticated
    # submitter identifies which business they're reporting about. Today,
    # every report is attributed to the bootstrap tenant; any admin/
    # investigator (of any tenant) can read any report_id by UUID. Close
    # this before relying on it with more than one real tenant active.
    report = (
        await db.execute(select(WhistleblowerReport).where(WhistleblowerReport.id == report_id))
    ).scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return WhistleblowerReportRead.model_validate(report)
