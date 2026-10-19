"""All operational tables. Money in kobo (BIGINT). store_id on every row."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy import (BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer,
                        JSON, String, Text, UniqueConstraint, func)
from app.core.database import Base


def default_store_id() -> str:
    from app.core.config import settings
    return settings.STORE_ID


def default_wash_price() -> int:
    from app.core.config import settings
    return settings.WASH_PRICE_KOBO


def uid() -> str:
    return uuid.uuid4().hex[:12]

def now() -> datetime:
    return datetime.now(timezone.utc)

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    customer_code = Column(String, unique=True, default=uid)
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    preferred_name = Column(String, default="")
    phone = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, default="")
    password_hash = Column(String, default="")
    google_sub = Column(String, unique=True, index=True, nullable=True)
    registered_via = Column(String, default="in_store")
    registered_by_user_id = Column(String, default="")
    phone_verified_at = Column(DateTime, nullable=True)
    segment = Column(String, default="new")
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


# Email is the customer sign in identity, so it must be unique even when the
# database collation is case sensitive. Empty emails are allowed for customers
# who registered in store or with a phone code only.
Index(
    "ix_customers_email_lower_unique",
    func.lower(Customer.email),
    unique=True,
    postgresql_where=Customer.email.isnot(None) & (Customer.email != ""),
    sqlite_where=Customer.email.isnot(None) & (Customer.email != ""),
)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    email = Column(String, unique=True, index=True)
    name = Column(String, default="")
    password_hash = Column(String, default="")
    role = Column(String, default="staff")  # staff|manager|owner
    pin_hash = Column(String, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

class OperatingDay(Base):
    __tablename__ = "operating_days"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    date = Column(String, index=True)  # YYYY-MM-DD (Africa/Lagos)
    queue_opens_at = Column(String, default="08:00")
    queue_closes_at = Column(String, default="19:30")
    accepting_bookings = Column(Boolean, default=True)
    dropoff_open = Column(Boolean, default=True)
    dropoff_capacity = Column(Integer, default=10)
    status = Column(String, default="open")
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)
    __table_args__ = (UniqueConstraint("store_id", "date", name="uq_day"),)

class Service(Base):
    __tablename__ = "services"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    kind = Column(String, default="self_service_wash")
    name = Column(String, default="")
    unit_price = Column(BigInteger, default=default_wash_price)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    order_no = Column(Integer, index=True)
    customer_id = Column(String, ForeignKey("customers.id"), index=True)
    operating_day_id = Column(String, ForeignKey("operating_days.id"), nullable=True)
    type = Column(String, default="self_service")  # self_service|dropoff|retail
    channel = Column(String, default="in_store")   # online|in_store
    status = Column(String, default="booked", index=True)
    subtotal = Column(BigInteger, default=0)
    discount = Column(BigInteger, default=0)
    total = Column(BigInteger, default=0)
    payment_status = Column(String, default="unpaid")
    checked_in_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(String, default="")
    idempotency_key = Column(String, default="")
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    order_id = Column(String, ForeignKey("orders.id"), index=True)
    service_id = Column(String, ForeignKey("services.id"))
    qty = Column(Integer, default=1)
    unit_price = Column(BigInteger, default=0)
    line_total = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=now)

class WashUnit(Base):
    __tablename__ = "wash_units"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    order_id = Column(String, ForeignKey("orders.id"), index=True)
    unit_no = Column(String, index=True)  # 1025-1
    queue_seq = Column(Integer, index=True)
    status = Column(String, default="queued", index=True)
    washer_id = Column(String, ForeignKey("machines.id"), nullable=True)
    dryer_id = Column(String, ForeignKey("machines.id"), nullable=True)
    est_wash_start = Column(DateTime, nullable=True)
    est_ready_at = Column(DateTime, nullable=True)
    wash_started_at = Column(DateTime, nullable=True)
    wash_ended_at = Column(DateTime, nullable=True)
    dry_started_at = Column(DateTime, nullable=True)
    dry_ended_at = Column(DateTime, nullable=True)
    grace_started_at = Column(DateTime, nullable=True)
    grace_expires_at = Column(DateTime, nullable=True)
    skip_count = Column(Integer, default=0)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

class Machine(Base):
    __tablename__ = "machines"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    kind = Column(String, default="washer")  # washer|dryer
    label = Column(String, default="")
    status = Column(String, default="available")  # available|running|error|maintenance
    unavailable_until = Column(DateTime, nullable=True)
    current_wash_unit_id = Column(String, nullable=True)
    busy_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

class MachineEvent(Base):
    __tablename__ = "machine_events"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    machine_id = Column(String, ForeignKey("machines.id"), index=True)
    type = Column(String, default="status")
    wash_unit_id = Column(String, default="")
    reason = Column(String, default="")
    authorised_by = Column(String, default="")
    occurred_at = Column(DateTime, default=now)

class ReworkEvent(Base):
    __tablename__ = "rework_events"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    wash_unit_id = Column(String, ForeignKey("wash_units.id"), index=True)
    type = Column(String, default="rewash")  # rewash|rerinse|redry
    reason = Column(String, default="")
    machine_id = Column(String, default="")
    started_at = Column(DateTime, default=now)
    ended_at = Column(DateTime, nullable=True)
    extra_minutes = Column(Integer, default=20)
    staff_id = Column(String, default="")

class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    order_id = Column(String, ForeignKey("orders.id"), index=True)
    method = Column(String, default="cash", index=True)
    amount = Column(BigInteger, default=0)
    kind = Column(String, default="payment")  # payment|refund
    status = Column(String, default="confirmed")
    paystack_reference = Column(String, unique=True, nullable=True)
    fee = Column(BigInteger, default=0)
    recorded_by = Column(String, default="")
    paid_at = Column(DateTime, default=now)
    created_at = Column(DateTime, default=now)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    customer_id = Column(String, index=True)
    template = Column(String, default="")
    channel = Column(String, default="in_app")
    status = Column(String, default="queued")
    payload = Column(JSON, default=dict)
    sent_at = Column(DateTime, nullable=True)
    dedupe_key = Column(String, unique=True)
    created_at = Column(DateTime, default=now)

class DailyClose(Base):
    __tablename__ = "daily_closes"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id)
    operating_day_id = Column(String, unique=True)
    expected = Column(JSON, default=dict)
    actual = Column(JSON, default=dict)
    variance = Column(JSON, default=dict)
    notes = Column(Text, default="")
    closed_by = Column(String, default="")
    closed_at = Column(DateTime, default=now)
    snapshot = Column(JSON, default=dict)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    actor_user_id = Column(String, default="")
    action = Column(String, default="", index=True)
    entity_type = Column(String, default="")
    entity_id = Column(String, default="")
    before = Column(JSON, default=dict)
    after = Column(JSON, default=dict)
    reason = Column(String, default="")
    ip = Column(String, default="")
    occurred_at = Column(DateTime, default=now)

class Setting(Base):
    __tablename__ = "settings"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    key = Column(String, index=True)
    value = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=now, onupdate=now)
    __table_args__ = (UniqueConstraint("store_id", "key", name="uq_setting"),)


class OtpChallenge(Base):
    """Phone OTP: only the hash is stored; codes are single-use with attempts cap."""
    __tablename__ = "otp_challenges"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    phone = Column(String, index=True)
    code_hash = Column(String)
    expires_at = Column(DateTime)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    request_ip = Column(String, default="")
    created_at = Column(DateTime, default=now)


class LoginCode(Base):
    """Short-lived, single-use code used to hand Google sign in back to the web app.

    Only the hash is stored. The raw code travels in the URL fragment to the
    frontend, then is exchanged for a normal token pair.
    """
    __tablename__ = "login_codes"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    code_hash = Column(String, unique=True, index=True)
    customer_id = Column(String, index=True)
    expires_at = Column(DateTime)
    consumed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)


class RefreshToken(Base):
    """Server-side refresh-token registry for rotation + revocation."""
    __tablename__ = "refresh_tokens"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    jti = Column(String, unique=True, index=True)
    subject_id = Column(String, index=True)
    role = Column(String, default="customer")
    expires_at = Column(DateTime)
    revoked = Column(Boolean, default=False)
    replaced_by = Column(String, default="")
    created_at = Column(DateTime, default=now)


class DeviceToken(Base):
    """Long-lived tokens for kiosk hardware (store TV). Stored hashed."""
    __tablename__ = "device_tokens"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    label = Column(String, default="tv")
    token_hash = Column(String, unique=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, default="")
    created_at = Column(DateTime, default=now)


class LoginAttempt(Base):
    """Failed/successful auth attempts for lockout + audit."""
    __tablename__ = "login_attempts"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, default=default_store_id, index=True)
    identifier = Column(String, index=True)  # email or phone
    success = Column(Boolean, default=False)
    ip = Column(String, default="")
    created_at = Column(DateTime, default=now)
