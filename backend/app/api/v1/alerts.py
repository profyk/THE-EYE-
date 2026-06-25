from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role, require_tenant_id
from app.ledger.append import append_event
from app.models.user import User
from app.schemas.alert import AlertActionRequest, AlertRead
from app.schemas.event import EventCreate
from app.services.alert_service import (
    BULK_EXPORT_THRESHOLD,
    BULK_EXPORT_WINDOW_MINUTES,
    CRITICAL_FINANCIAL_LOOKBACK_HOURS,
    FAILED_LOGIN_THRESHOLD,
    FAILED_LOGIN_WINDOW_MINUTES,
    acknowledge_alert,
    evaluate_alerts,
)
from app.services.source_service import get_source_by_name

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])

PLATFORM_SOURCE_NAME = "the-eye-platform"


@router.get("/rules", dependencies=[Depends(require_role("admin", "investigator", "platform_admin"))])
async def list_alert_rules() -> list[dict]:
    return [
        {
            "rule_id": "failed_logins",
            "name": "Repeated failed logins",
            "severity": "high",
            "description": (
                f"Triggers when a single actor accumulates {FAILED_LOGIN_THRESHOLD}+ failed outcomes "
                f"within a rolling {FAILED_LOGIN_WINDOW_MINUTES}-minute window. "
                "Detects brute-force and credential stuffing attacks."
            ),
            "threshold": FAILED_LOGIN_THRESHOLD,
            "window_minutes": FAILED_LOGIN_WINDOW_MINUTES,
            "category_filter": "any",
        },
        {
            "rule_id": "bulk_data_export",
            "name": "Bulk data export detected",
            "severity": "critical",
            "description": (
                f"Triggers when a single actor generates {BULK_EXPORT_THRESHOLD}+ data_access events "
                f"within a {BULK_EXPORT_WINDOW_MINUTES}-minute window. "
                "Detects large-scale data exfiltration or scraping."
            ),
            "threshold": BULK_EXPORT_THRESHOLD,
            "window_minutes": BULK_EXPORT_WINDOW_MINUTES,
            "category_filter": "data_access",
        },
        {
            "rule_id": "critical_financial",
            "name": "High-severity financial transaction",
            "severity": "critical",
            "description": (
                f"Triggers on any high/critical-severity financial_transaction event in the last "
                f"{CRITICAL_FINANCIAL_LOOKBACK_HOURS} hours. "
                "Flags potentially fraudulent or unauthorized financial activity."
            ),
            "threshold": 1,
            "lookback_hours": CRITICAL_FINANCIAL_LOOKBACK_HOURS,
            "category_filter": "financial_transaction",
        },
    ]


@router.get("", response_model=list[AlertRead], dependencies=[Depends(require_role("admin", "investigator", "platform_admin"))])
async def list_alerts(
    db: AsyncSession = Depends(get_db), tenant_id: UUID = Depends(require_tenant_id)
) -> list[AlertRead]:
    alerts = await evaluate_alerts(db, tenant_id=tenant_id)
    return [
        AlertRead(
            key=a.key,
            rule_id=a.rule_id,
            rule_name=a.rule_name,
            severity=a.severity,
            actor_id=a.actor_id,
            message=a.message,
            detected_at=a.detected_at,
            status=a.status,
            acknowledged_by=a.acknowledged_by,
            acknowledged_at=a.acknowledged_at,
        )
        for a in alerts
    ]


@router.post("/{alert_key}/action", response_model=dict)
async def act_on_alert(
    alert_key: str,
    body: AlertActionRequest,
    user: User = Depends(require_role("admin", "investigator", "platform_admin")),
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(require_tenant_id),
) -> dict:
    await acknowledge_alert(
        db,
        alert_key=alert_key,
        rule_id=body.rule_id,
        actor_id=body.actor_id,
        status=body.action,
        user_id=user.id,
        tenant_id=tenant_id,
    )

    # The acknowledgment/escalation action is itself a real, auditable event --
    # not a separate untracked admin action.
    source = await get_source_by_name(db, PLATFORM_SOURCE_NAME)
    if source is not None:
        event = EventCreate(
            occurred_at=datetime.now(timezone.utc),
            actor_type="user",
            actor_id=user.username,
            event_type=f"alert.{body.action}",
            event_category="administrative",
            outcome="success",
            target_type="alert",
            target_id=alert_key,
            metadata={"rule_id": body.rule_id, "subject_actor_id": body.actor_id},
        )
        await append_event(db, event, source_id=source.id, tenant_id=tenant_id)
        await db.commit()

    return {"alert_key": alert_key, "status": body.action}
