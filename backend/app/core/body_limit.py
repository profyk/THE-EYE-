"""Pure-ASGI request body size cap -- applied before FastAPI/Pydantic ever
buffers or parses the body. Without this, a client can send an arbitrarily
large body and the framework will happily read all of it into memory before
validation gets a chance to reject it on content (e.g. max_metadata_bytes),
which is itself a memory-exhaustion DoS vector.

Two layers: reject immediately on a declared Content-Length over the cap
(the common case -- covers any well-behaved HTTP client), and also count
bytes as they stream in as a safety net for chunked/absent Content-Length,
aborting the connection rather than buffering past the cap.
"""
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class MaxBodySizeMiddleware:
    def __init__(self, app: ASGIApp, max_body_size: int):
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared_length = int(value)
                except ValueError:
                    declared_length = None
                if declared_length is not None and declared_length > self.max_body_size:
                    response = PlainTextResponse("Request body too large", status_code=413)
                    await response(scope, receive, send)
                    return
                break

        total_received = 0

        async def limited_receive():
            nonlocal total_received
            message = await receive()
            if message["type"] == "http.request":
                total_received += len(message.get("body") or b"")
                if total_received > self.max_body_size:
                    raise RuntimeError("Request body exceeded the configured size limit")
            return message

        await self.app(scope, limited_receive, send)
