import ipaddress

from fastapi import Request


def _as_valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError:
        # Notably: Starlette's TestClient reports request.client.host as the
        # literal string "testclient", not an IP -- this guard keeps that from
        # ever propagating into an EventCreate (which would otherwise raise an
        # unhandled validation error and 500 the whole request).
        return None
    return value


def get_client_ip(request: Request, *, trust_proxy: bool = True) -> str | None:
    """Best-effort real client IP behind a reverse proxy/tunnel.

    trust_proxy=True (default): check Cloudflare's CF-Connecting-IP first
    (authoritative when behind Cloudflare), then X-Forwarded-For, then the raw
    socket peer. Set trust_proxy=False when the API is exposed directly to the
    internet without any proxy, so an attacker cannot spoof these headers to
    rotate their apparent IP and bypass IP-keyed rate limits."""
    if trust_proxy:
        cf_ip = _as_valid_ip(request.headers.get("CF-Connecting-IP", "").strip() or None)
        if cf_ip:
            return cf_ip

        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            forwarded_ip = _as_valid_ip(forwarded.split(",")[0].strip())
            if forwarded_ip:
                return forwarded_ip

    if request.client:
        return _as_valid_ip(request.client.host)

    return None
