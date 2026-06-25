from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.event import EventCreate


def _base_kwargs(**overrides):
    base = dict(
        occurred_at=datetime.now(timezone.utc),
        actor_type="user",
        actor_id="alice",
        event_type="auth.login",
        event_category="authentication",
        outcome="success",
    )
    base.update(overrides)
    return base


def test_valid_event_passes():
    EventCreate(**_base_kwargs(metadata={"reason": "password_change"}))


@pytest.mark.parametrize("forbidden_key", ["keystrokes", "screenshot", "file_contents", "password", "PASSWORD"])
def test_forbidden_metadata_keys_rejected(forbidden_key):
    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(metadata={forbidden_key: "anything"}))


def test_forbidden_keys_rejected_when_nested():
    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(metadata={"details": {"screenshot": "base64..."}}))


def test_oversized_metadata_rejected():
    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(metadata={"blob": "x" * 20_000}))


def test_event_type_must_be_dotted_category_action_form():
    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(event_type="not-dotted"))


def test_future_occurred_at_rejected():
    from datetime import timedelta

    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(occurred_at=datetime.now(timezone.utc) + timedelta(hours=1)))


def test_far_past_occurred_at_rejected():
    from datetime import timedelta

    with pytest.raises(ValidationError):
        EventCreate(**_base_kwargs(occurred_at=datetime.now(timezone.utc) - timedelta(days=30)))
