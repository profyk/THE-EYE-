import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest

from app.services import geoip_service
from app.services.geoip_service import lookup_geoip


@pytest.fixture(autouse=True)
def _clear_geoip_cache():
    # The lookup cache is module-level and persists across tests; several
    # tests below reuse the same IP, so a hit from one test would otherwise
    # leak into the next and skip its mocked urlopen entirely.
    geoip_service._cache.clear()
    yield
    geoip_service._cache.clear()


def _mock_response(payload: dict):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    return mock_resp


def test_lookup_geoip_success():
    with patch("app.services.geoip_service.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value = _mock_response(
            {
                "city": "Johannesburg",
                "region": "Gauteng",
                "country_name": "South Africa",
                "latitude": -26.2041,
                "longitude": 28.0473,
            }
        )
        result = lookup_geoip("8.8.8.8")

    assert result == {
        "city": "Johannesburg",
        "region": "Gauteng",
        "country": "South Africa",
        "latitude": -26.2041,
        "longitude": 28.0473,
    }


def test_lookup_geoip_handles_provider_error_response():
    with patch("app.services.geoip_service.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value = _mock_response({"error": True, "reason": "rate limited"})
        result = lookup_geoip("8.8.8.8")

    assert result is None


def test_lookup_geoip_fails_open_on_network_error():
    with patch("app.services.geoip_service.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.side_effect = urllib.error.URLError("network down")
        result = lookup_geoip("8.8.8.8")

    assert result is None


def test_lookup_geoip_skips_private_ips():
    with patch("app.services.geoip_service.urllib.request.urlopen") as mock_urlopen:
        result = lookup_geoip("127.0.0.1")

    mock_urlopen.assert_not_called()
    assert result is None


def test_lookup_geoip_skips_none():
    assert lookup_geoip(None) is None


def test_lookup_geoip_caches_repeated_lookups():
    # A flood of failed attempts from one attacker IP should hit the network
    # at most once, not once per attempt.
    with patch("app.services.geoip_service.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value = _mock_response(
            {"city": "Lagos", "region": "Lagos", "country_name": "Nigeria", "latitude": 6.5, "longitude": 3.4}
        )
        first = lookup_geoip("8.8.8.8")
        for _ in range(10):
            repeated = lookup_geoip("8.8.8.8")
            assert repeated == first

    assert mock_urlopen.call_count == 1
