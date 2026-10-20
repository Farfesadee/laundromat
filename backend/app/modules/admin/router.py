"""Super admin console: full visibility and day to day control.

Every route here requires the owner or super_admin role.  Reads are shaped for
the console so one request can power the overview, while writes are deliberate
and audited.  Operational actions that already exist on the staff API are not
duplicated: the console calls those endpoints with the same admin token.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core.config import settings
from app.core.constants import (
    DEFAULTS,
    MACHINE_KINDS,
    MACHINE_STATUSES,
    ORDER_STATUSES,
    ROLE_SUPER_ADMIN,
)
from app.core.database import get_db
from app.core.deps import audit, require_role
from app.models import (
    AuditLog,
    Customer,
    Machine,
    Notification,
    OperatingDay,
    Order,
    OrderItem,
    Payment,
    Service,
    Setting,
    User,
    WashUnit,
)

router = APIRouter(prefix="/admin", tags=["admin"])
Admin = Depends(require_role("owner"))

_SETTING_LIMITS = {
    "wash_minutes": (5, 180),
    "dry_minutes": (5, 180),
    "grace_minutes": (0, 60),
    "max_wait_minutes": (0, 600),
    "wash_price_kobo": (0, 10_000_000),
    "order_no_start": (1, 1_000_000),
}
_SETTING_LABELS = {
    "wash_minutes": "Wash length",
    "dry_minutes": "Dry length",
    "grace_minutes": "Grace period",
    "max_wait_minutes": "Maximum wait",
    "wash_price_kobo": "Wash price",
    "order_no_start": "First order number",
}
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _local_today() -> str:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(settings.STORE_TIMEZONE)).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()


def _naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _day(db: Session) -> OperatingDay | None:
    today = _local_today()
    d = db.query(OperatingDay).filter(OperatingDay.date == today).first()
    if d:
        return d
    return db.query(OperatingDay).order_by(OperatingDay.date.desc()).first()


def _name(c: Customer | None) -> str:
    if not c:
        return "Walk-in"
    return c.preferred_name or " ".join(x for x in (c.first_name, c.last_name) if x).strip() or c.phone or "Customer"


def _setting(db: Session, key: str):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        return DEFAULTS.get(key)
    value = row.value
    if isinstance(value, dict) and "v" in value:
        return value["v"]
    return value


def _settings_map(db: Session) -> dict:
    return {key: _setting(db, key) for key in DEFAULTS}


def _paid_for(db: Session, oid: str) -> int:
    payments = db.query(Payment).filter(Payment.order_id == oid).all()
    return sum(p.amount for p in payments if p.kind == "payment" and p.status == "confirmed") - sum(
        p.amount for p in payments if p.kind == "refund" and p.status == "confirmed"
    )


def _order_row(db: Session, o: Order, c: Customer | None = None) -> dict:
    c = c or db.query(Customer).get(o.customer_id)
    paid = _paid_for(db, o.id)
    return {
        "id": o.id,
        "order_no": o.order_no,
        "customer_id": o.customer_id,
        "customer": _name(c),
        "phone": c.phone if c else "",
        "email": c.email if c else "",
        "type": o.type,
        "channel": o.channel,
        "status": o.status,
        "payment_status": o.payment_status,
        "total": o.total,
        "paid": paid,
        "balance": max(0, int(o.total) - paid),
        "units": db.query(WashUnit).filter(WashUnit.order_id == o.id).count(),
        "created_at": o.created_at,
        "checked_in_at": o.checked_in_at,
    }


def _machine_label(db: Session, mid: str | None) -> str:
    if not mid:
        return ""
    m = db.query(Machine).get(mid)
    return m.label if m else ""


# ---------------------------------------------------------------------------
# Overview and visibility
# ---------------------------------------------------------------------------


@router.get("/overview")
def overview(db: Session = Depends(get_db), _p: dict = Admin):
    day = _day(db)
    today_orders = (
        db.query(Order).filter(Order.operating_day_id == day.id).all() if day else []
    )
    order_ids = [o.id for o in today_orders]
    payments_today = (
        db.query(Payment).filter(Payment.order_id.in_(order_ids)).all() if order_ids else []
    )
    confirmed = [p for p in payments_today if p.status == "confirmed"]
    collected = sum(p.amount if p.kind == "payment" else -p.amount for p in confirmed)
    expected = sum(o.total for o in today_orders if o.status != "cancelled")
    paid_by_order = Counter()
    for p in confirmed:
        paid_by_order[p.order_id] += p.amount if p.kind == "payment" else -p.amount
    outstanding = sum(
        max(0, int(o.total) - paid_by_order.get(o.id, 0))
        for o in today_orders
        if o.status not in ("cancelled", "expired")
    )
    by_method: Counter = Counter()
    for p in confirmed:
        by_method[p.method] += p.amount if p.kind == "payment" else -p.amount

    live_units = (
        db.query(WashUnit)
        .filter(WashUnit.status.notin_(("collected", "cancelled", "skipped")))
        .order_by(WashUnit.queue_seq)
        .limit(30)
        .all()
    )
    live_queue = []
    for u in live_units:
        o = db.query(Order).get(u.order_id)
        c = db.query(Customer).get(o.customer_id) if o else None
        live_queue.append(
            {
                "id": u.id,
                "unit_no": u.unit_no,
                "customer": _name(c),
                "status": u.status,
                "queue_seq": u.queue_seq,
                "est_start": u.est_wash_start,
                "est_ready": u.est_ready_at,
                "machine": _machine_label(db, u.washer_id or u.dryer_id),
                "order_id": u.order_id,
                "order_no": o.order_no if o else None,
            }
        )

    machines = db.query(Machine).order_by(Machine.kind, Machine.label).all()
    machine_rows = []
    for m in machines:
        current_unit = db.query(WashUnit).get(m.current_wash_unit_id) if m.current_wash_unit_id else None
        current_order = db.query(Order).get(current_unit.order_id) if current_unit else None
        current_customer = db.query(Customer).get(current_order.customer_id) if current_order else None
        machine_rows.append(
            {
                "id": m.id,
                "kind": m.kind,
                "label": m.label,
                "status": m.status,
                "busy_until": m.busy_until,
                "current_unit": current_unit.unit_no if current_unit else "",
                "current_customer": _name(current_customer) if current_customer else "",
            }
        )

    recent = db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    recent_orders = [_order_row(db, o) for o in recent]

    activity = db.query(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(12).all()
    actors = {u.id: u.email for u in db.query(User).all()}
    customers = {c.id: _name(c) for c in db.query(Customer).all()}
    activity_rows = [
        {
            "actor": actors.get(a.actor_user_id) or customers.get(a.actor_user_id) or "system",
            "action": a.action,
            "entity": f"{a.entity_type}:{a.entity_id}" if a.entity_type else "",
            "reason": a.reason,
            "at": a.occurred_at,
        }
        for a in activity
    ]

    notifications = db.query(Notification).order_by(Notification.created_at.desc()).limit(8).all()
    notification_rows = [
        {
            "customer": customers.get(n.customer_id, "Customer"),
            "template": n.template,
            "channel": n.channel,
            "status": n.status,
            "at": n.created_at,
        }
        for n in notifications
    ]

    start = _naive_utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    new_customers = db.query(Customer).filter(Customer.created_at >= start).count()
    active_staff = db.query(User).filter(User.is_active == True).count()  # noqa: E712

    alerts = []
    for m in machines:
        if m.status in ("error", "maintenance"):
            alerts.append(
                {
                    "tone": "danger" if m.status == "error" else "warn",
                    "title": f"{m.label} is {m.status}",
                    "detail": "Open the floor view to log a note or return it to service.",
                }
            )
    for u in live_units:
        if u.status == "grace":
            alerts.append(
                {
                    "tone": "warn",
                    "title": f"{u.unit_no} is in grace",
                    "detail": "The customer has not checked in yet.",
                }
            )
    stale_cutoff = _naive_utc_now() - timedelta(minutes=15)
    for o in today_orders:
        if o.status == "pending_payment" and o.created_at and o.created_at < stale_cutoff:
            alerts.append(
                {
                    "tone": "warn",
                    "title": f"Order #{o.order_no} is awaiting payment",
                    "detail": "It has been waiting for more than 15 minutes.",
                }
            )

    return {
        "server_time": datetime.now(timezone.utc),
        "store": {
            "name": "LAUNDROMAT",
            "date": day.date if day else _local_today(),
            "status": day.status if day else "open",
            "accepting_bookings": bool(day.accepting_bookings if day else True),
            "dropoff_open": bool(day.dropoff_open if day else True),
            "dropoff_capacity": day.dropoff_capacity if day else 0,
            "queue_opens_at": day.queue_opens_at if day else settings.QUEUE_OPEN,
            "queue_closes_at": day.queue_closes_at if day else settings.QUEUE_CLOSE,
        },
        "stats": {
            "collected_kobo": collected,
            "expected_kobo": expected,
            "outstanding_kobo": outstanding,
            "orders_today": len(today_orders),
            "active_orders": sum(
                1 for o in today_orders if o.status not in ("collected", "cancelled", "expired")
            ),
            "customers_total": db.query(Customer).count(),
            "new_customers_today": new_customers,
            "active_staff": active_staff,
            "queue_units": len(live_units),
            "washers_available": sum(
                1 for m in machines if m.kind == "washer" and m.status == "available"
            ),
            "dryers_available": sum(
                1 for m in machines if m.kind == "dryer" and m.status == "available"
            ),
        },
        "payments_by_method": dict(by_method),
        "order_statuses": dict(Counter(o.status for o in today_orders)),
        "live_queue": live_queue,
        "machines": machine_rows,
        "recent_orders": recent_orders,
        "activity": activity_rows,
        "notifications": notification_rows,
        "alerts": alerts[:8],
    }


@router.get("/orders")
def list_orders(
    q: str = "",
    status: str = "",
    limit: int = Query(100, ge=1, le=250),
    db: Session = Depends(get_db),
    _p: dict = Admin,
):
    query = db.query(Order, Customer).outerjoin(Customer, Order.customer_id == Customer.id)
    if status in ORDER_STATUSES:
        query = query.filter(Order.status == status)
    if q:
        like = f"%{q.strip()}%"
        filters = [
            Customer.phone.like(like),
            Customer.email.like(like),
            Customer.preferred_name.like(like),
            Customer.first_name.like(like),
            Customer.last_name.like(like),
        ]
        if q.strip().isdigit():
            filters.append(Order.order_no == int(q.strip()))
        query = query.filter(or_(*filters))
    rows = query.order_by(Order.created_at.desc()).limit(limit).all()
    return [_order_row(db, o, c) for o, c in rows]


@router.get("/orders/{oid}")
def order_detail(oid: str, db: Session = Depends(get_db), _p: dict = Admin):
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "We could not find that order. It may have been removed.")
    c = db.query(Customer).get(o.customer_id)
    items = (
        db.query(OrderItem, Service)
        .outerjoin(Service, OrderItem.service_id == Service.id)
        .filter(OrderItem.order_id == o.id)
        .all()
    )
    units = db.query(WashUnit).filter(WashUnit.order_id == o.id).order_by(WashUnit.queue_seq).all()
    payments = db.query(Payment).filter(Payment.order_id == o.id).order_by(Payment.paid_at).all()
    return {
        **_order_row(db, o, c),
        "customer_detail": {
            "id": c.id,
            "name": _name(c),
            "phone": c.phone or "",
            "email": c.email or "",
            "segment": c.segment if c else "new",
        }
        if c
        else None,
        "items": [
            {
                "name": s.name if s else "Item",
                "qty": i.qty,
                "unit_price": i.unit_price,
                "line_total": i.line_total,
            }
            for i, s in items
        ],
        "units_detail": [
            {
                "id": u.id,
                "unit_no": u.unit_no,
                "status": u.status,
                "queue_seq": u.queue_seq,
                "machine": _machine_label(db, u.washer_id or u.dryer_id),
                "est_start": u.est_wash_start,
                "est_ready": u.est_ready_at,
            }
            for u in units
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "amount": p.amount,
                "kind": p.kind,
                "status": p.status,
                "reference": p.paystack_reference or "",
                "paid_at": p.paid_at,
            }
            for p in payments
        ],
    }


@router.get("/customers")
def list_customers(
    q: str = "",
    limit: int = Query(100, ge=1, le=250),
    db: Session = Depends(get_db),
    _p: dict = Admin,
):
    query = db.query(Customer)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Customer.phone.like(like),
                Customer.email.like(like),
                Customer.preferred_name.like(like),
                Customer.first_name.like(like),
                Customer.last_name.like(like),
                Customer.customer_code.like(like),
            )
        )
    rows = query.order_by(Customer.created_at.desc()).limit(limit).all()
    out = []
    for c in rows:
        orders = db.query(Order).filter(Order.customer_id == c.id).all()
        last = max((o.created_at for o in orders), default=None)
        out.append(
            {
                "id": c.id,
                "customer_code": c.customer_code,
                "name": _name(c),
                "first_name": c.first_name,
                "last_name": c.last_name,
                "preferred_name": c.preferred_name,
                "phone": c.phone or "",
                "email": c.email or "",
                "segment": c.segment,
                "registered_via": c.registered_via,
                "orders": len(orders),
                "spend": sum(_paid_for(db, o.id) for o in orders),
                "last_order_at": last,
                "created_at": c.created_at,
            }
        )
    return out


@router.patch("/customers/{cid}")
def update_customer(cid: str, body: dict, db: Session = Depends(get_db), p: dict = Admin):
    c = db.query(Customer).get(cid)
    if not c:
        raise HTTPException(404, "We could not find that customer. They may have been removed.")
    before = {
        "first_name": c.first_name,
        "last_name": c.last_name,
        "preferred_name": c.preferred_name,
        "phone": c.phone,
        "email": c.email,
        "segment": c.segment,
    }
    if "phone" in body:
        raw_phone = (body.get("phone") or "").strip()
        phone = sec.normalize_phone(raw_phone) if raw_phone else None
        existing = db.query(Customer).filter(Customer.phone == phone, Customer.id != c.id).first()
        if existing:
            raise HTTPException(409, "That phone number belongs to another customer")
        c.phone = phone
    if "email" in body:
        email = (body.get("email") or "").strip().lower()
        if email:
            existing = (
                db.query(Customer)
                .filter(func.lower(Customer.email) == email, Customer.id != c.id)
                .first()
            )
            if existing:
                raise HTTPException(409, "That email belongs to another customer")
        c.email = email
    for key, max_len in (("first_name", 60), ("last_name", 60), ("preferred_name", 60), ("segment", 30)):
        if key in body:
            setattr(c, key, (body.get(key) or "").strip()[:max_len])
    audit(db, p.get("sub"), "customer.update", "customer", c.id, before, body, store_id=c.store_id)
    db.commit()
    return {"ok": True}


@router.get("/team")
def team(db: Session = Depends(get_db), _p: dict = Admin):
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "active": u.is_active,
            "created_at": u.created_at,
            "has_pin": bool(u.pin_hash),
        }
        for u in db.query(User).order_by(User.created_at).all()
    ]


def _allowed_roles(actor_role: str) -> set[str]:
    roles = {"staff", "manager", "owner"}
    if actor_role == ROLE_SUPER_ADMIN:
        roles.add(ROLE_SUPER_ADMIN)
    return roles


@router.post("/team", status_code=201)
def create_team_member(body: dict, db: Session = Depends(get_db), p: dict = Admin):
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Enter a valid email address.")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "A user with that email already exists")
    role = (body.get("role") or "staff").strip()
    if role not in _allowed_roles(p.get("role", "")):
        raise HTTPException(403, "You cannot create that role")
    password = body.get("password") or ""
    if not password:
        raise HTTPException(400, "Set a password for this team member.")
    pin = (body.get("pin") or "").strip()
    if pin and (not pin.isdigit() or len(pin) != 4):
        raise HTTPException(400, "Your PIN should be exactly 4 digits.")
    u = User(
        store_id=settings.STORE_ID,
        email=email,
        name=(body.get("name") or email.split("@")[0]).strip()[:80],
        role=role,
        password_hash=sec.hash_password(password),
        pin_hash=sec.hash_pin(pin) if pin else "",
    )
    db.add(u)
    audit(db, p.get("sub"), "user.create", "user", email, None, {"role": role})
    db.commit()
    return {"id": u.id, "email": u.email, "role": u.role}


@router.patch("/team/{uid}")
def update_team_member(uid: str, body: dict, db: Session = Depends(get_db), p: dict = Admin):
    u = db.query(User).get(uid)
    if not u:
        raise HTTPException(404, "We could not find that team member. They may have been removed.")
    before = {"name": u.name, "role": u.role, "active": u.is_active}
    is_self = uid == p.get("sub")
    role = (body.get("role") or u.role).strip()
    if not is_self and role not in _allowed_roles(p.get("role", "")):
        raise HTTPException(403, "You cannot assign that role")
    if is_self and role != u.role:
        raise HTTPException(400, "You cannot change your own role.")
    active = bool(body.get("is_active", u.is_active))
    if is_self and not active:
        raise HTTPException(400, "You cannot deactivate your own account.")
    if (not active or role not in ("owner", ROLE_SUPER_ADMIN)) and u.role in ("owner", ROLE_SUPER_ADMIN):
        remaining = (
            db.query(User)
            .filter(
                User.id != u.id,
                User.is_active == True,  # noqa: E712
                User.role.in_(("owner", ROLE_SUPER_ADMIN)),
            )
            .count()
        )
        if remaining == 0:
            raise HTTPException(400, "Keep at least one active owner account.")
    if "name" in body:
        u.name = (body.get("name") or "").strip()[:80]
    if "role" in body:
        u.role = role
    if "is_active" in body:
        u.is_active = active
    if body.get("password"):
        u.password_hash = sec.hash_password(body["password"])
    if "pin" in body:
        pin = (body.get("pin") or "").strip()
        if pin and (not pin.isdigit() or len(pin) != 4):
            raise HTTPException(400, "Your PIN should be exactly 4 digits.")
        u.pin_hash = sec.hash_pin(pin) if pin else ""
    audit(db, p.get("sub"), "user.update", "user", uid, before, {"role": u.role, "active": u.is_active})
    db.commit()
    return {"ok": True}


@router.get("/services")
def services(db: Session = Depends(get_db), _p: dict = Admin):
    return [
        {
            "id": s.id,
            "kind": s.kind,
            "name": s.name,
            "unit_price": s.unit_price,
            "is_active": s.is_active,
        }
        for s in db.query(Service).order_by(Service.kind, Service.name).all()
    ]


@router.post("/services", status_code=201)
def create_service(body: dict, db: Session = Depends(get_db), p: dict = Admin):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Enter a name for this service.")
    try:
        price = int(body.get("unit_price", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Enter a valid price.")
    if price < 0:
        raise HTTPException(400, "The price cannot be negative.")
    s = Service(
        store_id=settings.STORE_ID,
        kind=(body.get("kind") or "retail").strip()[:40],
        name=name[:80],
        unit_price=price,
        is_active=bool(body.get("is_active", True)),
    )
    db.add(s)
    audit(db, p.get("sub"), "service.create", "service", s.id, None, {"name": s.name, "price": price})
    db.commit()
    return {"id": s.id}


@router.patch("/services/{sid}")
def update_service(sid: str, body: dict, db: Session = Depends(get_db), p: dict = Admin):
    s = db.query(Service).get(sid)
    if not s:
        raise HTTPException(404, "We could not find that service. It may have been removed.")
    before = {"name": s.name, "unit_price": s.unit_price, "is_active": s.is_active}
    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Enter a name for this service.")
        s.name = name[:80]
    if "kind" in body:
        s.kind = (body.get("kind") or s.kind).strip()[:40]
    if "unit_price" in body:
        try:
            s.unit_price = int(body["unit_price"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Enter a valid price.")
        if s.unit_price < 0:
            raise HTTPException(400, "The price cannot be negative.")
    if "is_active" in body:
        s.is_active = bool(body["is_active"])
    audit(db, p.get("sub"), "service.update", "service", sid, before, body)
    db.commit()
    return {"ok": True}


@router.get("/machines")
def machines(db: Session = Depends(get_db), _p: dict = Admin):
    rows = db.query(Machine).order_by(Machine.kind, Machine.label).all()
    out = []
    for m in rows:
        current_unit = db.query(WashUnit).get(m.current_wash_unit_id) if m.current_wash_unit_id else None
        current_order = db.query(Order).get(current_unit.order_id) if current_unit else None
        current_customer = db.query(Customer).get(current_order.customer_id) if current_order else None
        out.append(
            {
                "id": m.id,
                "kind": m.kind,
                "label": m.label,
                "status": m.status,
                "busy_until": m.busy_until,
                "current_unit": current_unit.unit_no if current_unit else "",
                "current_customer": _name(current_customer) if current_customer else "",
            }
        )
    return out


@router.post("/machines", status_code=201)
def create_machine(body: dict, db: Session = Depends(get_db), p: dict = Admin):
    kind = (body.get("kind") or "washer").strip()
    status = (body.get("status") or "available").strip()
    label = (body.get("label") or "").strip()
    if kind not in MACHINE_KINDS:
        raise HTTPException(400, "Choose washer or dryer.")
    if status not in MACHINE_STATUSES:
        raise HTTPException(400, "Choose a valid machine status.")
    if not label:
        raise HTTPException(400, "Enter a name or number for this machine.")
    if db.query(Machine).filter(func.lower(Machine.label) == label.lower()).first():
        raise HTTPException(409, "That machine label already exists")
    m = Machine(store_id=settings.STORE_ID, kind=kind, label=label[:20], status=status)
    db.add(m)
    audit(db, p.get("sub"), "machine.create", "machine", m.id, None, {"label": label, "kind": kind})
    db.commit()
    return {"id": m.id}


@router.patch("/machines/{mid}")
def update_machine(mid: str, body: dict, db: Session = Depends(get_db), p: dict = Admin):
    m = db.query(Machine).get(mid)
    if not m:
        raise HTTPException(404, "We could not find that machine. It may have been removed.")
    before = {"label": m.label, "kind": m.kind, "status": m.status}
    if "label" in body:
        label = (body.get("label") or "").strip()
        if not label:
            raise HTTPException(400, "Enter a name or number for this machine.")
        duplicate = (
            db.query(Machine)
            .filter(func.lower(Machine.label) == label.lower(), Machine.id != m.id)
            .first()
        )
        if duplicate:
            raise HTTPException(409, "That machine label already exists")
        m.label = label[:20]
    if "kind" in body:
        if body["kind"] not in MACHINE_KINDS:
            raise HTTPException(400, "Choose washer or dryer.")
        m.kind = body["kind"]
    if "status" in body:
        if body["status"] not in MACHINE_STATUSES:
            raise HTTPException(400, "Choose a valid machine status.")
        m.status = body["status"]
        if m.status in ("available", "maintenance"):
            m.current_wash_unit_id = None
            m.busy_until = None
    audit(db, p.get("sub"), "machine.update", "machine", mid, before, body, body.get("reason", ""))
    db.commit()
    return {"ok": True}


@router.get("/settings")
def get_admin_settings(db: Session = Depends(get_db), _p: dict = Admin):
    day = _day(db)
    return {
        "settings": _settings_map(db),
        "defaults": DEFAULTS,
        "day": {
            "id": day.id if day else "",
            "date": day.date if day else _local_today(),
            "accepting_bookings": bool(day.accepting_bookings if day else True),
            "dropoff_open": bool(day.dropoff_open if day else True),
            "dropoff_capacity": day.dropoff_capacity if day else 10,
            "queue_opens_at": day.queue_opens_at if day else settings.QUEUE_OPEN,
            "queue_closes_at": day.queue_closes_at if day else settings.QUEUE_CLOSE,
            "status": day.status if day else "open",
        },
    }


@router.put("/settings")
def update_admin_settings(body: dict, db: Session = Depends(get_db), p: dict = Admin):
    settings_body = body.get("settings") or {}
    day_body = body.get("day") or {}
    before = {"settings": _settings_map(db)}
    for key, value in settings_body.items():
        if key not in _SETTING_LIMITS:
            raise HTTPException(400, "That setting is not recognized. Please refresh and try again.")
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise HTTPException(400, f"Enter a valid number for {_SETTING_LABELS[key].lower()}.")
        low, high = _SETTING_LIMITS[key]
        if number < low or number > high:
            raise HTTPException(
                400,
                f"Choose a {_SETTING_LABELS[key].lower()} between {low} and {high}.",
            )
        row = db.query(Setting).filter(Setting.key == key).first()
        if row:
            row.value = {"v": number}
        else:
            db.add(Setting(store_id=settings.STORE_ID, key=key, value={"v": number}))

    day = _day(db)
    if day_body:
        if not day:
            raise HTTPException(404, "There is no open day to update. Please refresh and try again.")
        before["day"] = {
            "accepting_bookings": day.accepting_bookings,
            "dropoff_open": day.dropoff_open,
            "dropoff_capacity": day.dropoff_capacity,
            "queue_opens_at": day.queue_opens_at,
            "queue_closes_at": day.queue_closes_at,
        }
        for key in ("accepting_bookings", "dropoff_open"):
            if key in day_body:
                setattr(day, key, bool(day_body[key]))
        if "dropoff_capacity" in day_body:
            try:
                capacity = int(day_body["dropoff_capacity"])
            except (TypeError, ValueError):
                raise HTTPException(400, "Enter a valid number for drop-off capacity.")
            if capacity < 0 or capacity > 200:
                raise HTTPException(400, "Choose a drop-off capacity between 0 and 200.")
            day.dropoff_capacity = capacity
        for key in ("queue_opens_at", "queue_closes_at"):
            if key in day_body:
                value = str(day_body[key]).strip()
                if not _TIME_RE.match(value):
                    raise HTTPException(400, "Enter times as HH:MM, for example 08:00.")
                setattr(day, key, value)
    audit(db, p.get("sub"), "settings.update", "settings", "all", before, body)
    db.commit()
    return {"ok": True}


@router.get("/payments")
def payments(
    q: str = "",
    kind: str = "",
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _p: dict = Admin,
):
    query = db.query(Payment, Order, Customer).outerjoin(
        Order, Payment.order_id == Order.id
    ).outerjoin(Customer, Order.customer_id == Customer.id)
    if kind in ("payment", "refund"):
        query = query.filter(Payment.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        filters = [
            Payment.method.like(like),
            Payment.paystack_reference.like(like),
            Customer.phone.like(like),
            Customer.email.like(like),
            Customer.preferred_name.like(like),
        ]
        if q.strip().isdigit():
            filters.append(Order.order_no == int(q.strip()))
        query = query.filter(or_(*filters))
    rows = query.order_by(Payment.paid_at.desc()).limit(limit).all()
    return [
        {
            "id": pay.id,
            "order_id": pay.order_id,
            "order_no": o.order_no if o else None,
            "customer": _name(c) if c else "Customer",
            "method": pay.method,
            "amount": pay.amount,
            "kind": pay.kind,
            "status": pay.status,
            "reference": pay.paystack_reference or "",
            "paid_at": pay.paid_at,
        }
        for pay, o, c in rows
    ]


@router.get("/audit")
def audit_log(
    action: str = "",
    actor: str = "",
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _p: dict = Admin,
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.like(f"%{action}%"))
    if actor:
        query = query.filter(AuditLog.actor_user_id == actor)
    rows = query.order_by(AuditLog.occurred_at.desc()).limit(limit).all()
    users = {u.id: u.email for u in db.query(User).all()}
    customers = {c.id: _name(c) for c in db.query(Customer).all()}
    return [
        {
            "id": r.id,
            "actor": users.get(r.actor_user_id) or customers.get(r.actor_user_id) or "system",
            "actor_id": r.actor_user_id,
            "action": r.action,
            "entity": f"{r.entity_type}:{r.entity_id}" if r.entity_type else "",
            "before": r.before,
            "after": r.after,
            "reason": r.reason,
            "ip": r.ip,
            "at": r.occurred_at,
        }
        for r in rows
    ]
