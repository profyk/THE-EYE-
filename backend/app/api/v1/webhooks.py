import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.services.paddle_service import handle_paddle_event, verify_paddle_signature

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


@router.post("/paddle", status_code=status.HTTP_200_OK)
async def paddle_webhook(
    request: Request,
    paddle_signature: str | None = Header(default=None, alias="Paddle-Signature"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_body = await request.body()

    if not verify_paddle_signature(raw_body, paddle_signature or "", settings.paddle_webhook_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON body")

    await handle_paddle_event(db, event)
    return {"ok": True}
