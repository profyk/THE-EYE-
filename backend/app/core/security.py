import hashlib
import hmac
import secrets

API_KEY_PREFIX = "eye_live_"
_PREFIX_DISPLAY_LEN = 8  # chars of the random part shown in UI, e.g. "...3f2a9c1b"


def generate_api_key() -> str:
    return API_KEY_PREFIX + secrets.token_urlsafe(32)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def key_display_prefix(raw_key: str) -> str:
    return raw_key[: len(API_KEY_PREFIX) + _PREFIX_DISPLAY_LEN]


# Password hashing via stdlib hashlib.scrypt -- deliberately avoids adding a
# new dependency (e.g. passlib/bcrypt) given this session's repeated disk-space
# constraints. scrypt is a well-regarded memory-hard KDF available in any
# Python 3.6+ stdlib, with no install required.
# N=2**17, r=8, p=1 is OWASP's current recommended baseline (~128MB memory
# cost per hash). Bumping this invalidates every previously stored hash since
# verify_password re-derives with these constants -- there is no in-place
# rehash path, so existing accounts need set_user_password() called again.
_SCRYPT_N = 2**17
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
# hashlib.scrypt defaults to a 32MiB memory cap and raises if N*r*p needs more;
# give it enough headroom for the params above.
_SCRYPT_MAXMEM = 128 * _SCRYPT_N * _SCRYPT_R * _SCRYPT_P * 2


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    """Returns (password_hash_hex, salt_hex). Generates a fresh random salt
    if one isn't supplied (the normal case, e.g. when creating a new user)."""
    if salt is None:
        salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
        maxmem=_SCRYPT_MAXMEM,
    )
    return derived.hex(), salt.hex()


def verify_password(password: str, password_hash_hex: str, salt_hex: str) -> bool:
    derived, _ = hash_password(password, salt=bytes.fromhex(salt_hex))
    return hmac.compare_digest(derived, password_hash_hex)


def validate_password_strength(password: str, min_length: int) -> str | None:
    """Returns an error message string if the password fails, None if it passes."""
    if len(password) < min_length:
        return f"Password must be at least {min_length} characters."
    if password.lower() == password:
        return "Password must contain at least one uppercase letter."
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one digit."
    return None


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
