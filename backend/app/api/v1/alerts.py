from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_role
from app.ledger.append import append_event
from app.models.user import User
from app.schemas.alert import AlertActionRequest, AlertRead
from app.schemas.event import EventCreate
from app.services.alert_service import acknowledge_alert, evaluate_alerts
from app.services.source_service import get_source_by_name

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])

PLATFORM_SOURCE_NAME = "the-eye-platform"


@router.get("", response_model=list[AlertRead], dependencies=[Depends(require_role("admin", "investigator"))])
async def list_alerts(db: AsyncSession = Depends(get_db)) -> list[AlertRead]:
    alerts = await evaluate_alerts(db)
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
    user: User = Depends(require_role("admin", "investigator")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await acknowledge_alert(
        db, alert_key=alert_key, rule_id=body.rule_id, actor_id=body.actor_id, status=body.action, user_id=user.id
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
        await append_event(db, event, source_id=source.id)
        await db.commit()

    return {"alert_key": alert_key, "status": body.action}
