from datetime import datetime, timezone

from app.ledger.hashing import GENESIS_HASH, build_canonical_payload, compute_record_hash


def _payload(**overrides):
    base = dict(
        sequence_num=1,
        tenant_id="00000000-0000-0000-0000-000000000000",
        source_id="11111111-1111-1111-1111-111111111111",
        actor_type="user",
        actor_id="alice",
        event_type="auth.login",
        event_category="authentication",
        outcome="success",
        occurred_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        target_type=None,
        target_id=None,
        change_summary=None,
        metadata={},
        prev_hash=GENESIS_HASH,
    )
    base.update(overrides)
    return build_canonical_payload(**base)


def test_hash_is_deterministic():
    payload = _payload()
    assert compute_record_hash(payload) == compute_record_hash(payload)


def test_hash_is_hex_sha256_length():
    h = compute_record_hash(_payload())
    assert len(h) == 64
    int(h, 16)  # raises if not valid hex


def test_different_payloads_hash_differently():
    h1 = compute_record_hash(_payload(actor_id="alice"))
    h2 = compute_record_hash(_payload(actor_id="bob"))
    assert h1 != h2


def test_key_order_does_not_affect_hash():
    payload_a = _payload(actor_id="alice", event_type="auth.login")
    # dict literal order differs but json.dumps(sort_keys=True) makes byte
    # serialization order-independent
    payload_b = {k: payload_a[k] for k in reversed(list(payload_a.keys()))}
    assert compute_record_hash(payload_a) == compute_record_hash(payload_b)


def test_prev_hash_changes_resulting_hash():
    h1 = compute_record_hash(_payload(prev_hash=GENESIS_HASH))
    h2 = compute_record_hash(_payload(prev_hash="a" * 64))
    assert h1 != h2
