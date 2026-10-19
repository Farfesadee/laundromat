"""Application configuration. Secrets have NO hardcoded fallbacks in non-local envs.

- APP_ENV=local allows clearly-marked dev defaults (with a startup warning).
- staging/production REQUIRE JWT_SECRET (and Paystack keys for payments).
"""
from __future__ import annotations
import os
import warnings


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class Settings:
    APP_ENV: str = _env("APP_ENV", "local")
    DATABASE_URL: str = _env("DATABASE_URL", "sqlite:///./laundromat.db")
    REDIS_URL: str = _env("REDIS_URL", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_MINUTES: int = _env_int("JWT_ACCESS_MINUTES", 15)
    JWT_REFRESH_DAYS: int = _env_int("JWT_REFRESH_DAYS", 7)
    PAYSTACK_CALLBACK_URL: str = _env("PAYSTACK_CALLBACK_URL", "http://localhost:3000/checkout/callback")
    FRONTEND_URL: str = _env("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    PUBLIC_API_URL: str = _env("PUBLIC_API_URL", "http://localhost:8000/api/v1").rstrip("/")
    GOOGLE_CLIENT_ID: str = _env("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = _env("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = _env("GOOGLE_REDIRECT_URI", "")
    SMS_ENABLED: bool = _env("SMS_ENABLED", "false").lower() in ("1", "true", "yes")
    STORE_TIMEZONE: str = _env("STORE_TIMEZONE", "Africa/Lagos")
    STORE_ID: str = _env("STORE_ID", "store-1")
    CORS_ORIGINS: list[str] = [o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
    # Business defaults (admin can override at runtime via /settings; env only seeds them)
    WASH_MINUTES: int = _env_int("WASH_MINUTES", 35)
    DRY_MINUTES: int = _env_int("DRY_MINUTES", 20)
    GRACE_MINUTES: int = _env_int("GRACE_MINUTES", 10)
    MAX_WAIT_MINUTES: int = _env_int("MAX_WAIT_MINUTES", 120)
    WASH_PRICE_KOBO: int = _env_int("WASH_PRICE_KOBO", 400000)
    QUEUE_OPEN: str = _env("QUEUE_OPEN", "08:00")
    QUEUE_CLOSE: str = _env("QUEUE_CLOSE", "19:30")
    ORDER_NO_START: int = _env_int("ORDER_NO_START", 1025)
    # Demo seeding (local/dev only; never in production)
    SEED_DEMO: bool = _env("SEED_DEMO", "true").lower() in ("1", "true", "yes")
    SEED_ADMIN_EMAIL: str = _env("SEED_ADMIN_EMAIL", "")
    SEED_ADMIN_PASSWORD: str = _env("SEED_ADMIN_PASSWORD", "")
    SEED_ADMIN_PIN: str = _env("SEED_ADMIN_PIN", "")

    def __init__(self) -> None:
        secret = os.getenv("JWT_SECRET", "")
        paystack = os.getenv("PAYSTACK_SECRET_KEY", "")
        if not secret:
            if self.APP_ENV == "local":
                warnings.warn("JWT_SECRET not set. Using an ephemeral dev secret. Set JWT_SECRET for any shared env.")
                secret = "local-only-ephemeral-dev-secret-not-for-production-0123456789"
            else:
                raise RuntimeError("JWT_SECRET is required in non-local environments")
        if len(secret) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters")
        self.JWT_SECRET: str = secret
        if not paystack and self.APP_ENV != "local":
            raise RuntimeError("PAYSTACK_SECRET_KEY is required in non-local environments")
        self.PAYSTACK_SECRET_KEY: str = paystack or "sk_test_unconfigured"

    @property
    def is_local(self) -> bool:
        return self.APP_ENV == "local"

    @property
    def paystack_configured(self) -> bool:
        key = (self.PAYSTACK_SECRET_KEY or "").strip()
        if self.is_local:
            return key.startswith("sk_")
        return key.startswith(("sk_test_", "sk_live_")) and key != "sk_test_unconfigured"

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID.strip() and self.GOOGLE_CLIENT_SECRET.strip())

    @property
    def google_redirect_uri(self) -> str:
        if self.GOOGLE_REDIRECT_URI.strip():
            return self.GOOGLE_REDIRECT_URI.strip()
        return f"{self.PUBLIC_API_URL}/auth/google/callback"

    @property
    def sms_configured(self) -> bool:
        return bool(self.SMS_ENABLED)


settings = Settings()
