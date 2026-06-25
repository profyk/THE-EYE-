from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import (
    alerts,
    auth,
    deletion_requests,
    events,
    forensics,
    intrusion,
    investigate,
    platform,
    sources,
    stats,
    tenants,
    users,
    whistleblower,
)
from app.config import settings
from app.core.body_limit import MaxBodySizeMiddleware
from app.core.errors import validation_exception_handler

app = FastAPI(title="THE EYE", version="0.1.0")

# Starlette's add_middleware prepends to the stack, so the LAST one added
# runs FIRST on the way in (and last on the way out) -- MaxBodySizeMiddleware
# is added last so an oversized request gets rejected before CORS or anything
# else downstream spends any effort on it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(MaxBodySizeMiddleware, max_body_size=settings.max_request_body_bytes)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.env != "development":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.add_exception_handler(RequestValidationError, validation_exception_handler)

app.include_router(events.router)
app.include_router(sources.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(alerts.router)
app.include_router(forensics.router)
app.include_router(deletion_requests.router)
app.include_router(investigate.router)
app.include_router(whistleblower.router)
app.include_router(intrusion.router)
app.include_router(tenants.router)
app.include_router(platform.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
