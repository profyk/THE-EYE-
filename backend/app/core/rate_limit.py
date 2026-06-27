"""Minimal in-memory rate limiter -- no new dependency (no Redis/slowapi).
Used as both a per-endpoint guard (login, whistleblower, ingestion failures)
and a global per-IP backstop middleware in app.main.
Good enough for a single-process MVP deployment; not distributed-safe, which
is an explicitly accepted limitation here, not an oversight. Used by the
public whistleblower endpoint, dashboard login, and rejected ingestion-key
logging -- the abuse vectors that have no other auth gate to lean on.

Memory is bounded two ways: (1) a key's entry is deleted once all its
timestamps age out of the window, so long-idle keys don't linger forever, and
(2) a hard cap on distinct tracked keys protects against a burst of many
never-seen-before keys (e.g. spoofed X-Forwarded-For values, one per request)
arriving faster than any single key's window could expire -- without the cap,
that's an unbounded-memory DoS regardless of per-key decay.
"""
import time

_request_log: dict[str, list[float]] = {}
_MAX_TRACKED_KEYS = 50_000


def check_rate_limit(key: str, *, max_requests: int, window_seconds: int) -> bool:
    """Returns True if the request is allowed (and records it). Returns False
    if the key has already hit max_requests within the window."""
    now = time.time()
    cutoff = now - window_seconds

    timestamps = _request_log.get(key)
    if timestamps is not None:
        while timestamps and timestamps[0] < cutoff:
            timestamps.pop(0)
        if not timestamps:
            del _request_log[key]
            timestamps = None

    if timestamps is not None:
        if len(timestamps) >= max_requests:
            return False
        timestamps.append(now)
        return True

    # New key. If the table is already at capacity, fail closed (treat as
    # rate-limited) rather than letting it grow without bound or paying an
    # O(n) eviction scan on every call once full.
    if len(_request_log) >= _MAX_TRACKED_KEYS:
        return False

    _request_log[key] = [now]
    return True
