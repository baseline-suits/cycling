from __future__ import annotations

import hashlib
import base64
import hmac
import struct
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: str) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.access_token_minutes * 60
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256"), expires_in


def decode_access_token(token: str) -> str:
    settings = get_settings()
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    if payload.get("type") != "access" or not payload.get("sub"):
        raise jwt.InvalidTokenError("Not an access token")
    return str(payload["sub"])


def create_media_playback_token(user_id: str, activity_id: str, media_id: str) -> tuple[str, int]:
    expires_in = 30 * 60
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "type": "media-playback",
        "activity_id": activity_id,
        "media_id": media_id,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm="HS256"), expires_in


def decode_media_playback_token(token: str, activity_id: str, media_id: str) -> str:
    payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    if (
        payload.get("type") != "media-playback"
        or payload.get("activity_id") != activity_id
        or payload.get("media_id") != media_id
        or not payload.get("sub")
    ):
        raise jwt.InvalidTokenError("Not a media playback token")
    return str(payload["sub"])


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _factor_cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().secret_key.encode()).digest())
    return Fernet(key)


def encrypt_factor_secret(value: str) -> str:
    return _factor_cipher().encrypt(value.encode()).decode()


def decrypt_factor_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _factor_cipher().decrypt(value.encode()).decode()
    except (InvalidToken, UnicodeDecodeError):
        return None


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def verify_totp(secret: str | None, code: str, *, at: int | None = None) -> bool:
    if not secret or not code or not code.isdigit() or len(code) != 6:
        return False
    counter = int((at or int(datetime.now(timezone.utc).timestamp())) // 30)
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    for offset in (-1, 0, 1):
        digest = hmac.new(key, struct.pack(">Q", counter + offset), hashlib.sha1).digest()
        start = digest[-1] & 0x0F
        value = (struct.unpack(">I", digest[start:start + 4])[0] & 0x7FFFFFFF) % 1_000_000
        if hmac.compare_digest(f"{value:06d}", code):
            return True
    return False


def totp_uri(secret: str, email: str) -> str:
    issuer = get_settings().webauthn_rp_name
    from urllib.parse import quote
    return f"otpauth://totp/{quote(issuer)}:{quote(email)}?secret={secret}&issuer={quote(issuer)}&digits=6&period=30"


def create_factor_challenge(*, user_id: str, challenge: bytes, purpose: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "type": "factor", "purpose": purpose, "challenge": base64.urlsafe_b64encode(challenge).decode(),
         "iat": now, "exp": now + timedelta(minutes=2)},
        get_settings().secret_key, algorithm="HS256"
    )


def decode_factor_challenge(token: str, *, purpose: str) -> tuple[str, bytes]:
    payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    if payload.get("type") != "factor" or payload.get("purpose") != purpose or not payload.get("sub"):
        raise jwt.InvalidTokenError("Ungültige Sicherheits-Challenge")
    return str(payload["sub"]), base64.urlsafe_b64decode(payload["challenge"])
