"""Seed: store day, machines, services, and (local only) demo accounts.

- Production: creates ONLY the operating day, machines, services and settings.
  Admin accounts must be created via POST /api/v1/users (owner). They are never seeded here.
- Local (SEED_DEMO=true): additionally creates demo staff/manager/owner from
  SEED_* env vars (or ephemeral random credentials printed once) plus a small
  demo queue so the TV and dashboards have content.
"""
from __future__ import annotations
import secrets
from datetime import datetime, timezone, timedelta
from app.core.config import settings
from app.core.constants import DEFAULTS
from app.core.database import SessionLocal, init_db
from app.core import security as sec
from app.models import User, Machine, Service, Customer, OperatingDay, Order, WashUnit, Setting

WASHERS = 6
DRYERS = 5

def _today() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(settings.STORE_TIMEZONE)).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()

def seed() -> dict:
    init_db()
    db = SessionLocal()
    created: dict = {"demo": False}
    try:
        if db.query(Machine).count() == 0:
            for i in range(1, WASHERS + 1):
                db.add(Machine(store_id=settings.STORE_ID, kind="washer", label=f"W{i}", status="available"))
            for i in range(1, DRYERS + 1):
                db.add(Machine(store_id=settings.STORE_ID, kind="dryer", label=f"D{i}", status="available"))
        if db.query(Service).count() == 0:
            db.add(Service(store_id=settings.STORE_ID, kind="self_service_wash",
                           name="Self-service Wash (10kg)", unit_price=settings.WASH_PRICE_KOBO))
            db.add(Service(store_id=settings.STORE_ID, kind="dropoff_wash", name="Drop-off Wash",
                           unit_price=int(settings.WASH_PRICE_KOBO * 1.25)))
            for kind, name, price in (("drink", "Bottled Water", 50000), ("drink", "Soft Drink", 100000),
                                      ("coffee", "Hot Coffee", 150000), ("coffee", "Iced Coffee", 200000)):
                db.add(Service(store_id=settings.STORE_ID, kind=kind, name=name, unit_price=price))
        today = _today()
        day = db.query(OperatingDay).filter(OperatingDay.date == today).first()
        if not day:
            day = OperatingDay(store_id=settings.STORE_ID, date=today,
                               queue_opens_at=settings.QUEUE_OPEN, queue_closes_at=settings.QUEUE_CLOSE,
                               accepting_bookings=True, dropoff_open=True, dropoff_capacity=10, status="open")
            db.add(day)
        for key in ("wash_minutes", "dry_minutes", "grace_minutes", "max_wait_minutes", "wash_price_kobo", "order_no_start"):
            if not db.query(Setting).filter(Setting.store_id == settings.STORE_ID, Setting.key == key).first():
                val = {"wash_minutes": settings.WASH_MINUTES, "dry_minutes": settings.DRY_MINUTES,
                       "grace_minutes": settings.GRACE_MINUTES, "max_wait_minutes": settings.MAX_WAIT_MINUTES,
                       "wash_price_kobo": settings.WASH_PRICE_KOBO, "order_no_start": settings.ORDER_NO_START}[key]
                db.add(Setting(store_id=settings.STORE_ID, key=key, value={"v": val}))
        db.commit()

        if settings.is_local and settings.SEED_DEMO and db.query(User).count() == 0:
            admin_email = settings.SEED_ADMIN_EMAIL or f"owner-{secrets.token_hex(3)}@example.com"
            admin_pw = settings.SEED_ADMIN_PASSWORD or sec.random_password()
            admin_pin = settings.SEED_ADMIN_PIN or sec.random_dev_pin()
            staff_pw = sec.random_password()
            db.add(User(store_id=settings.STORE_ID, email=admin_email, name="Owner", role="owner",
                        password_hash=sec.hash_password(admin_pw), pin_hash=sec.hash_pin(admin_pin)))
            db.add(User(store_id=settings.STORE_ID, email="manager@example.com", name="Manager", role="manager",
                        password_hash=sec.hash_password(sec.random_password()), pin_hash=sec.hash_pin(admin_pin)))
            db.add(User(store_id=settings.STORE_ID, email="staff@example.com", name="Staff", role="staff",
                        password_hash=sec.hash_password(staff_pw)))
            db.commit()
            created.update({"demo": True, "owner_email": admin_email,
                            "note": "Demo credentials are ephemeral. Set SEED_ADMIN_EMAIL/PASSWORD/PIN for stable local logins."})
            print(f"[seed] demo owner {admin_email} (password printed only when SEED_ADMIN_PASSWORD unset)")
        return created
    finally:
        db.close()

if __name__ == "__main__":
    print(seed())
