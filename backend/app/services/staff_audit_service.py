"""Convenience helper to record staff actions to the audit log."""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.staff_audit_log import StaffAuditLog
from app.models.user import User


async def log_staff_action(
    db: AsyncSession,
    actor: User,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    target_name: str | None = None,
    reason: str | None = None,
    severity: str = "info",
    details: dict[str, Any] | None = None,
) -> StaffAuditLog:
    entry = StaffAuditLog(
        occurred_at=datetime.now(timezone.utc),
        actor_id=actor.id,
        actor_username=actor.username,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        reason=reason,
        severity=severity,
        details=details,
    )
    db.add(entry)
    await db.flush()
    return entry
