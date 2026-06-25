"""Free IP geolocation lookup via stdlib urllib -- no new dependency.

Deliberately fails open: a third-party outage, rate limit, or malformed
response must never block a login or any other caller. Every failure mode
here returns None rather than raising.

A bounded, TTL'd in-memory cache sits in front of the actual network call.
Without it, a flood of failed logins/ingestion attempts from the same
attacker IP (the common case) would fire one live outbound request per
attempt -- slow, and a good way to get this app's own IP rate-limited or
blocked by the free GeoIP provider. The cache is cleared wholesale once it
hits its size cap rather than doing LRU bookkeeping: a cache miss just costs
one extra lookup, it's not a correctness concern.
"""
import ipaddress
import json
import threading
import time
import urllib.error
import urllib.request

GEOIP_URL_TEMPLATE = "https://ipapi.co/{ip}/json/"
TIMEOUT_SECONDS = 2
_CACHE_TTL_SECONDS = 3600
_CACHE_MAX_ENTRIES = 10_000

_cache: dict[str, tuple[float, dict | None]] = {}
_cache_lock = threading.Lock()


def _is_lookupable(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)


def _fetch_geoip(ip: str) -> dict | None:
    try:
        req = urllib.request.Request(
            GEOIP_URL_TEMPLATE.format(ip=ip),
            headers={"User-Agent": "the-eye-backend/0.1"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None

    if data.get("error"):
        return None

    return {
        "city": data.get("city"),
        "region": data.get("region"),
        "country": data.get("country_name"),
        # lat/long enable a real (if simplified) map plot in the intrusion
        # detection view, rather than a fabricated one -- ipapi.co includes
        # these on the same free lookup, no extra request needed.
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
    }


def lookup_geoip(ip: str | None) -> dict | None:
    if not ip or not _is_lookupable(ip):
        return None

    now = time.time()
    with _cache_lock:
        cached = _cache.get(ip)
        if cached is not None and cached[0] > now:
            return cached[1]

    result = _fetch_geoip(ip)

    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES and ip not in _cache:
            _cache.clear()
        _cache[ip] = (now + _CACHE_TTL_SECONDS, result)

    return result
