"""Small shared helpers: ids, timestamps, hashing, redaction."""
from __future__ import annotations

import datetime as _dt
import hashlib
import hmac
import re
import secrets
import uuid


def now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def now_iso() -> str:
    return now().replace(microsecond=0).isoformat()


def iso(ts: _dt.datetime) -> str:
    return ts.replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def token() -> str:
    return secrets.token_urlsafe(32)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_hex(text.encode("utf-8"))


def hmac_sha256_hex(key: bytes, message: str) -> str:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256, stdlib only).
# ---------------------------------------------------------------------------
_PBKDF2_ITERATIONS = 240_000


def hash_password(password: str, *, iterations: int = _PBKDF2_ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = encoded.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Redaction — secrets, tokens and PII are scrubbed before anything is shown,
# exported, logged or sent to a model. Defence in depth; connectors also redact.
# ---------------------------------------------------------------------------
_REDACTIONS = [
    # High-signal credential shapes first.
    (re.compile(r"(?i)\b(AKIA|ASIA)[0-9A-Z]{16}\b"), "«AWS-ACCESS-KEY»"),
    (re.compile(r"(?i)\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "«GITHUB-TOKEN»"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "«SLACK-TOKEN»"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "«API-KEY»"),
    (re.compile(r"(?i)-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END[^\n]*-----"),
     "«PRIVATE-KEY»"),
    (re.compile(r"(?i)\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"), "«JWT»"),
    # key=value / "key": "value" style secrets.
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer|private[_-]?key)\b"
                r"\s*[:=]\s*[\"']?([^\s\"',;}]{4,})"),
     lambda m: f"{m.group(1)}=«redacted»"),
    # Email addresses (PII).
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "«email»"),
    # Credit-card-like 13-19 digit runs.
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "«card»"),
]


def redact(text: str | None) -> str:
    if not text:
        return ""
    out = text
    for pattern, repl in _REDACTIONS:
        out = pattern.sub(repl, out)
    return out


def redact_obj(obj):
    """Recursively redact strings inside a JSON-ish object."""
    if isinstance(obj, str):
        return redact(obj)
    if isinstance(obj, dict):
        return {k: redact_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_obj(v) for v in obj]
    return obj


def clamp(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…[truncated]"
