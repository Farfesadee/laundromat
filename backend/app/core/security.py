"""Cryptography + tokens + OTP helpers.

- Passwords: bcrypt (via `bcrypt` package) with SHA-256 pre-hash so the
  72-byte limit can never truncate. Legacy pbkdf2 hashes from earlier
  builds still verify (and should be re-hashed on next login).
- Tokens: JWT with jti + explicit type (access/refresh). Refresh tokens
  are persisted (see models.RefreshToken) so they can be rotated/revoked.
- OTP: secrets-module codes, SHA-256 hashed at rest, constant-time compare.
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.constants import PASSWORD_MIN_LENGTH

# ---------- passwords ----------

def _bcrypt_hash(pw: str) -> str:
    import bcrypt
    pre = hashlib.sha256(pw.encode()).hexdigest().encode()
    return bcrypt.hashpw(pre, bcrypt.gensalt()).decode()


def _bcrypt_check(pw: str, hashed: str) -> bool:
    import bcrypt
    try:
        pre = hashlib.sha256(pw.encode()).hexdigest().encode()
        return bcrypt.checkpw(pre, hashed.encode())
    except Exception:
        return False


def _legacy_pbkdf2_check(pw: str, h: str) -> bool:
    try:
        parts = h.split("$")
        if len(parts) != 3 or parts[0] != "pbkdf2":
            return False
        salt = base64.b64decode(parts[1])
        want = base64.b64decode(parts[2])
        got = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000)
        return hmac.compare_digest(got, want)
    except Exception:
        return False


def hash_password(pw: str) -> str:
    validate_password(pw)
    return _bcrypt_hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    if not pw or not hashed:
        return False
    if hashed.startswith(("pbkdf2$", "$2a$", "$2b$")) and not hashed.startswith("pbkdf2$"):
        return _bcrypt_check(pw, hashed)
    if hashed.startswith("pbkdf2$"):
        return _legacy_pbkdf2_check(pw, hashed)
    return _bcrypt_check(pw, hashed)


def needs_rehash(hashed: str) -> bool:
    return hashed.startswith("pbkdf2$")


def validate_password(pw: str) -> None:
    from fastapi import HTTPException
    if len(pw) < PASSWORD_MIN_LENGTH:
        raise HTTPException(400, f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"[0-9]", pw):
        raise HTTPException(400, "Password must contain letters and numbers")


hash_pin = _bcrypt_hash
verify_pin = _bcrypt_check

# ---------- phone ----------

def normalize_phone(raw: str) -> str:
    """Validate to E.164. Raises 400 on invalid input."""
    from fastapi import HTTPException
    s = (raw or "").strip().replace(" ", "").replace("-", "")
    try:
        import phonenumbers
        num = phonenumbers.parse(s, "NG" if s.startswith("0") else None)
        if not phonenumbers.is_possible_number(num) or not phonenumbers.is_valid_number(num):
            raise ValueError("invalid")
        return phonenumbers.format_in_original_format(num, phonenumbers.PhoneNumberFormat.E164) \
            if s.startswith("+") else phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
    except ImportError:
        if not re.fullmatch(r"\+\d{7,15}", s):
            raise HTTPException(400, "Phone must be E.164 (e.g. +2348012345678)")
        return s
    except Exception:
        raise HTTPException(400, "Phone must be E.164 (e.g. +2348012345678)")

# ---------- JWT ----------

def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(sub: str, role: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "role": role, "type": "access", "jti": uuid.uuid4().hex,
               "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=settings.JWT_ACCESS_MINUTES)).timestamp())}
    if extra:
        payload.update(extra)
    return _encode(payload)


def create_refresh_token(sub: str, role: str) -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    exp = now + timedelta(days=settings.JWT_REFRESH_DAYS)
    payload = {"sub": sub, "role": role, "type": "refresh", "jti": jti,
               "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return _encode(payload), jti, exp


def decode_token(token: str, expect: str = "access") -> dict:
    data = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if data.get("type") != expect:
        raise ValueError(f"Expected {expect} token")
    return data

# ---------- OTP ----------

def generate_otp_code() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def hash_otp(code: str) -> str:
    return hashlib.sha256(f"{settings.JWT_SECRET}:{code}".encode()).hexdigest()


def verify_otp(code: str, code_hash: str) -> bool:
    if not code or not code_hash:
        return False
    return hmac.compare_digest(hash_otp(code), code_hash)

# ---------- Paystack ----------

def verify_paystack_signature(raw_body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    digest = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(digest, signature)


def random_dev_pin() -> str:
    return f"{secrets.randbelow(9000) + 1000:04d}"
