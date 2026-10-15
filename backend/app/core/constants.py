"""Single source of truth for roles, statuses, limits and business defaults.

No magic strings/numbers anywhere else. Import from here.
"""
from __future__ import annotations

# --- roles (ascending privilege) ---
ROLE_CUSTOMER = "customer"
ROLE_STAFF = "staff"
ROLE_MANAGER = "manager"
ROLE_OWNER = "owner"
ROLE_TV = "tv"
ROLE_RANK = {ROLE_CUSTOMER: 0, ROLE_STAFF: 1, ROLE_MANAGER: 2, ROLE_OWNER: 3}

# --- orders / wash units / machines ---
ORDER_STATUSES = ("pending_payment", "booked", "checked_in", "in_progress", "ready", "collected", "cancelled", "expired")
WASH_STATUSES = ("queued", "grace", "washing", "wash_done", "drying", "ready", "collected", "skipped", "error", "cancelled")
MACHINE_KINDS = ("washer", "dryer")
MACHINE_STATUSES = ("available", "running", "error", "maintenance")

# --- auth limits ---
OTP_LENGTH = 6
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_COOLDOWN_SECONDS = 60
OTP_MAX_PER_HOUR = 5
LOGIN_MAX_FAILURES = 5
LOGIN_LOCKOUT_MINUTES = 15
PIN_MAX_FAILURES = 5
PIN_LOCKOUT_MINUTES = 15
PASSWORD_MIN_LENGTH = 8

# --- business default keys (overridable via settings table / env) ---
SETTING_WASH_MINUTES = "wash_minutes"
SETTING_DRY_MINUTES = "dry_minutes"
SETTING_GRACE_MINUTES = "grace_minutes"
SETTING_MAX_WAIT_MINUTES = "max_wait_minutes"
SETTING_WASH_PRICE_KOBO = "wash_price_kobo"
SETTING_ORDER_NO_START = "order_no_start"

DEFAULTS = {
    SETTING_WASH_MINUTES: 35,
    SETTING_DRY_MINUTES: 20,
    SETTING_GRACE_MINUTES: 10,
    SETTING_MAX_WAIT_MINUTES: 120,
    SETTING_WASH_PRICE_KOBO: 400000,  # NGN 4,000, the brief's example price
    SETTING_ORDER_NO_START: 1025,
}
