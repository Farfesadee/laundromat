"""Orders + queue views + wash-unit lifecycle + machines + drop-off."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.deps import require_role, get_current_principal, audit
from app.core import security as sec
from app.models import Customer, Order, OrderItem, Service, WashUnit, Machine, MachineEvent, ReworkEvent, OperatingDay, Payment
from app.queue.service import recompute, estimate_for_new_booking

orders = APIRouter(prefix="/orders", tags=["orders"])
queue = APIRouter(prefix="/queue", tags=["queue"])
washes = APIRouter(prefix="/wash-units", tags=["wash-units"])
machines = APIRouter(prefix="/machines", tags=["machines"])
dropoff = APIRouter(prefix="/dropoff", tags=["dropoff"])

def _today(db: Session) -> OperatingDay:
    from app.core.config import settings as _s
    try:
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo(_s.STORE_TIMEZONE)).date().isoformat()
    except Exception:
        today = datetime.now(timezone.utc).date().isoformat()
    d = db.query(OperatingDay).filter(OperatingDay.store_id == _s.STORE_ID, OperatingDay.date == today).first()
    if not d:
        d = OperatingDay(store_id=_s.STORE_ID, date=today, queue_opens_at=_s.QUEUE_OPEN,
                         queue_closes_at=_s.QUEUE_CLOSE, accepting_bookings=True,
                         dropoff_open=True, dropoff_capacity=10, status="open")
        db.add(d); db.commit(); db.refresh(d)
    return d

def _next_order_no(db: Session) -> int:
    from app.core.config import settings as _s
    mx = db.query(func.max(Order.order_no)).scalar()
    base = _s.ORDER_NO_START - 1
    return int(mx) + 1 if mx else int(base) + 1

def _get_wash_service(db: Session) -> Service:
    from app.core.config import settings as _s
    s = db.query(Service).filter(Service.kind == "self_service_wash", Service.is_active == True).first()  # noqa: E712
    if not s:
        s = Service(store_id=_s.STORE_ID, kind="self_service_wash", name="Self-service Wash (10kg)",
                    unit_price=_s.WASH_PRICE_KOBO, is_active=True)
        db.add(s); db.commit(); db.refresh(s)
    return s

def _create_units(db: Session, order: Order, n: int, start_seq: int):
    units = []
    for i in range(n):
        u = WashUnit(order_id=order.id, unit_no=f"{order.order_no}-{i+1}",
                     queue_seq=start_seq + i, status="queued")
        db.add(u); units.append(u)
    return units

def _max_seq(db: Session) -> int:
    mx = db.query(func.max(WashUnit.queue_seq)).scalar() or 0
    return int(mx)

# ---------- queue views ----------
@queue.get("/estimate")
def queue_estimate(washes: int = 1, db: Session = Depends(get_db)):
    return estimate_for_new_booking(db, max(1, washes), datetime.now(timezone.utc))

@queue.get("")
def queue_staff(db: Session = Depends(get_db), _p: dict = Depends(require_role("staff"))):
    units = (db.query(WashUnit).filter(WashUnit.status.in_(("queued", "grace", "washing", "wash_done", "drying")))
             .order_by(WashUnit.queue_seq).limit(200).all())
    out = []
    for u in units:
        o = db.query(Order).get(u.order_id)
        c = db.query(Customer).get(o.customer_id) if o else None
        out.append({"id": u.id, "unit_no": u.unit_no, "customer": (c.preferred_name if c else "?"),
                    "washes": 1, "est_start": u.est_wash_start, "status": u.status,
                    "order_id": u.order_id, "skip_count": u.skip_count})
    return out

@queue.get("/public")
def queue_public(db: Session = Depends(get_db)):
    """TV-safe payload: time, preferred_name, machine label, status only."""
    units = (db.query(WashUnit).filter(WashUnit.status.in_(("washing", "drying", "queued", "wash_done")))
             .order_by(WashUnit.queue_seq).limit(12).all())
    now_serving, coming = [], []
    for u in units:
        o = db.query(Order).get(u.order_id)
        c = db.query(Customer).get(o.customer_id) if o else None
        m = db.query(Machine).get(u.washer_id) if u.washer_id else None
        row = {"time": (u.est_wash_start.isoformat() if u.est_wash_start else None),
               "name": (c.preferred_name if c else "?"), "machine": (m.label if m else "-"),
               "status": u.status}
        (now_serving if u.status in ("washing", "drying") else coming).append(row)
    return {"now_serving": now_serving[:6], "coming_up": coming[:6]}

# ---------- orders ----------
@orders.post("")
def create_order(body: dict, db: Session = Depends(get_db), p: dict = Depends(get_current_principal)):
    from app.core.config import settings as _s
    washes_n = int(body.get("washes", 1))
    if washes_n < 1 or washes_n > 20:
        raise HTTPException(400, "washes must be 1..20")
    otype = body.get("type", "self_service")
    channel = body.get("channel", "in_store")
    raw_phone = (body.get("phone") or "").strip()
    phone = sec.normalize_phone(raw_phone) if raw_phone else None
    email = (body.get("email") or "").strip().lower()
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(400, "Enter a valid email address")
    customer_id = body.get("customer_id")
    if not customer_id and p.get("role") == "customer":
        customer_id = p.get("sub")
    c = db.get(Customer, customer_id) if customer_id else None
    if not c and phone:
        c = db.query(Customer).filter(Customer.phone == phone).first()
    if not c:
        c = Customer(store_id=_s.STORE_ID, phone=phone, email=email,
                     preferred_name=(body.get("preferred_name") or "Walk-in").strip()[:60],
                     first_name=(body.get("preferred_name") or "").strip()[:60], registered_via=channel)
        db.add(c); db.flush()
    elif email and not c.email:
        c.email = email
    day = _today(db)
    if otype == "self_service" and not day.accepting_bookings:
        raise HTTPException(409, "Today's queue is currently closed. Please return tomorrow from 8:00 AM.")
    svc = _get_wash_service(db)
    no = _next_order_no(db)
    addons = body.get("addons", [])
    subtotal = washes_n * svc.unit_price + sum(int(a.get("unit_price", 0)) * int(a.get("qty", 1)) for a in addons)
    status = "booked" if channel != "online" else "pending_payment"
    if body.get("paid") is True:
        status = "booked"
    o = Order(order_no=no, customer_id=c.id, operating_day_id=day.id, type=otype, channel=channel,
              status=status, subtotal=subtotal, discount=int(body.get("discount", 0)),
              total=subtotal - int(body.get("discount", 0)), payment_status="unpaid",
              created_by_user_id=p.get("sub", ""), idempotency_key=body.get("idempotency_key", ""))
    db.add(o); db.flush()
    db.add(OrderItem(order_id=o.id, service_id=svc.id, qty=washes_n, unit_price=svc.unit_price,
                     line_total=washes_n * svc.unit_price))
    for a in addons:
        s2 = db.query(Service).get(a.get("service_id")) if a.get("service_id") else None
        db.add(OrderItem(order_id=o.id, service_id=s2.id if s2 else svc.id,
                         qty=int(a.get("qty", 1)), unit_price=int(a.get("unit_price", 0)),
                         line_total=int(a.get("unit_price", 0)) * int(a.get("qty", 1))))
    # Online card orders only open the queue after Paystack confirms payment.
    # Pay-in-store orders (in_store channel) join the queue immediately.
    if otype == "self_service" and status == "booked":
        _create_units(db, o, washes_n, _max_seq(db) + 1)
    db.commit()
    if status == "booked":
        recompute(db)
    return {"id": o.id, "order_no": no, "status": o.status, "total": o.total,
            "payment_required": status == "pending_payment"}

@orders.get("/{oid}")
def get_order(oid: str, db: Session = Depends(get_db), _p: dict = Depends(get_current_principal)):
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "Not found")
    units = db.query(WashUnit).filter(WashUnit.order_id == oid).all()
    items = db.query(OrderItem).filter(OrderItem.order_id == oid).all()
    pays = db.query(Payment).filter(Payment.order_id == oid).all()
    return {"id": o.id, "order_no": o.order_no, "status": o.status, "total": o.total,
            "payment_status": o.payment_status,
            "units": [{"id": u.id, "unit_no": u.unit_no, "status": u.status, "est_start": u.est_wash_start, "est_ready": u.est_ready_at} for u in units],
            "items": [{"qty": i.qty, "unit_price": i.unit_price} for i in items],
            "paid": sum(p.amount for p in pays if p.kind == "payment") - sum(p.amount for p in pays if p.kind == "refund")}

@orders.post("/{oid}/check-in")
def check_in(oid: str, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "Not found")
    o.status = "checked_in"; o.checked_in_at = datetime.now(timezone.utc)
    for u in db.query(WashUnit).filter(WashUnit.order_id == oid, WashUnit.status == "grace").all():
        u.status = "queued"; u.grace_started_at = None; u.grace_expires_at = None  # grace cancelled on arrival
    audit(db, p.get("sub"), "order.checkin", "order", oid, None, {"status": "checked_in"})
    db.commit(); recompute(db)
    return {"ok": True}

@orders.post("/{oid}/cancel")
def cancel_order(oid: str, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "Not found")
    o.status = "cancelled"
    for u in db.query(WashUnit).filter(WashUnit.order_id == oid).all():
        if u.status in ("queued", "grace"):
            u.status = "cancelled"
    audit(db, p.get("sub"), "order.cancel", "order", oid, None, None)
    db.commit(); recompute(db)
    return {"ok": True}

# ---------- wash units ----------
def _wu(db: Session, wid: str) -> WashUnit:
    u = db.query(WashUnit).get(wid)
    if not u:
        raise HTTPException(404, "Wash unit not found")
    return u

@washes.post("/{wid}/start")
def start_wash(wid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid); mid = body.get("machine_id")
    m = db.query(Machine).get(mid) if mid else None
    if m and m.status == "maintenance":
        raise HTTPException(409, "Machine in maintenance")
    u.status = "washing"; u.wash_started_at = datetime.now(timezone.utc)
    if m:
        m.status = "running"; m.current_wash_unit_id = u.id
        m.busy_until = u.wash_started_at + __import__("datetime").timedelta(minutes=35)
        u.washer_id = m.id
    o = db.query(Order).get(u.order_id)
    if o and o.status in ("booked", "checked_in"):
        o.status = "in_progress"
    audit(db, p.get("sub"), "wash.start", "wash_unit", wid, None, {"machine": mid})
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/complete")
def complete_wash(wid: str, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid)
    u.status = "wash_done"; u.wash_ended_at = datetime.now(timezone.utc)
    audit(db, p.get("sub"), "wash.complete", "wash_unit", wid, None, None)
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/start-dry")
def start_dry(wid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid); mid = body.get("machine_id")
    m = db.query(Machine).get(mid) if mid else None
    u.status = "drying"; u.dry_started_at = datetime.now(timezone.utc)
    if m:
        m.status = "running"; u.dryer_id = m.id
        m.busy_until = u.dry_started_at + __import__("datetime").timedelta(minutes=20)
    # free washer (load moved to dryer)
    if u.washer_id:
        w = db.query(Machine).get(u.washer_id)
        if w: w.status = "available"; w.current_wash_unit_id = None; w.busy_until = None
    audit(db, p.get("sub"), "dry.start", "wash_unit", wid, None, {"dryer": mid})
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/dry-complete")
def dry_complete(wid: str, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid)
    u.status = "ready"; u.dry_ended_at = datetime.now(timezone.utc)
    if u.dryer_id:
        d = db.query(Machine).get(u.dryer_id)
        if d: d.status = "available"; d.busy_until = None
    o = db.query(Order).get(u.order_id)
    if o:
        rest = db.query(WashUnit).filter(WashUnit.order_id == o.id, WashUnit.status.notin_(("ready", "collected", "cancelled"))).count()
        if rest == 0:
            o.status = "ready"
    audit(db, p.get("sub"), "dry.complete", "wash_unit", wid, None, None)
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/collect")
def collect(wid: str, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid)
    u.status = "collected"
    o = db.query(Order).get(u.order_id)
    if o:
        rest = db.query(WashUnit).filter(WashUnit.order_id == o.id, WashUnit.status.notin_(("collected", "cancelled"))).count()
        if rest == 0:
            o.status = "collected"
    audit(db, p.get("sub"), "wash.collect", "wash_unit", wid, None, None)
    db.commit()
    return {"ok": True}

@washes.post("/{wid}/skip")
def skip(wid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid)
    before = {"seq": u.queue_seq, "est": str(u.est_wash_start)}
    u.queue_seq = _max_seq(db) + 1; u.skip_count += 1; u.status = "queued"
    u.grace_started_at = None; u.grace_expires_at = None
    audit(db, p.get("sub"), "wash.skip", "wash_unit", wid, before, {"seq": u.queue_seq}, body.get("reason", ""))
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/rework")
def rework(wid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    u = _wu(db, wid)
    r = ReworkEvent(wash_unit_id=wid, type=body.get("type", "rewash"), reason=body.get("reason", ""),
                    machine_id=body.get("machine_id", ""), extra_minutes=int(body.get("extra_minutes", 20)),
                    staff_id=p.get("sub", ""))
    db.add(r)
    # extend machine busy time so engine re-projects
    mid = body.get("machine_id") or u.washer_id
    if mid:
        m = db.query(Machine).get(mid)
        if m:
            base = m.busy_until or datetime.now(timezone.utc)
            m.busy_until = base + __import__("datetime").timedelta(minutes=r.extra_minutes)
    u.status = "washing"
    audit(db, p.get("sub"), "wash.rework", "wash_unit", wid, None, body)
    db.commit(); recompute(db)
    return {"ok": True}

@washes.post("/{wid}/restart")
def restart(wid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    # manager PIN step-up
    pin = body.get("pin", "")
    ok = False; by = ""
    for usr in db.query(User).filter(User.role.in_(("manager", "owner"))).all():
        if usr.pin_hash and sec.verify_pin(pin, usr.pin_hash):
            ok = True; by = usr.email; break
    if not ok:
        raise HTTPException(403, "Manager PIN required")
    u = _wu(db, wid)
    u.wash_started_at = datetime.now(timezone.utc); u.status = "washing"
    mid = body.get("machine_id") or u.washer_id
    if mid:
        m = db.query(Machine).get(mid)
        if m:
            m.status = "running"
            m.busy_until = u.wash_started_at + __import__("datetime").timedelta(minutes=35)
    db.add(MachineEvent(machine_id=mid or "", type="restart", wash_unit_id=wid,
                        reason=body.get("reason", ""), authorised_by=by))
    audit(db, p.get("sub"), "wash.restart", "wash_unit", wid, None, {"by": by, "reason": body.get("reason", "")})
    db.commit(); recompute(db)
    return {"ok": True, "new_eta": (u.wash_started_at + __import__("datetime").timedelta(minutes=55)).isoformat()}

# ---------- machines ----------
@machines.get("")
def list_machines(db: Session = Depends(get_db)):
    return [{"id": m.id, "kind": m.kind, "label": m.label, "status": m.status,
             "busy_until": m.busy_until, "current": m.current_wash_unit_id}
            for m in db.query(Machine).order_by(Machine.kind, Machine.label).all()]

@machines.patch("/{mid}")
def patch_machine(mid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    m = db.query(Machine).get(mid)
    if not m:
        raise HTTPException(404, "Not found")
    before = {"status": m.status}
    m.status = body.get("status", m.status)
    if body.get("reason") is not None:
        db.add(MachineEvent(machine_id=mid, type="status", reason=body.get("reason", ""), authorised_by=p.get("sub", "")))
    if m.status == "error" and m.current_wash_unit_id:
        u = db.query(WashUnit).get(m.current_wash_unit_id)
        if u: u.status = "error"
    audit(db, p.get("sub"), "machine.patch", "machine", mid, before, {"status": m.status}, body.get("reason", ""))
    db.commit(); recompute(db)
    return {"ok": True}

@machines.post("/{mid}/events")
def machine_event(mid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    db.add(MachineEvent(machine_id=mid, type=body.get("type", "note"), wash_unit_id=body.get("wash_unit_id", ""),
                        reason=body.get("reason", ""), authorised_by=p.get("sub", "")))
    db.commit()
    return {"ok": True}

# ---------- drop-off ----------
@dropoff.get("/orders")
def dropoff_list(db: Session = Depends(get_db), _p: dict = Depends(require_role("staff"))):
    rows = db.query(Order).filter(Order.type == "dropoff").order_by(Order.created_at.desc()).limit(100).all()
    return [{"id": o.id, "order_no": o.order_no, "status": o.status, "total": o.total} for o in rows]

@dropoff.post("/orders")
def dropoff_create(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    body = dict(body); body["type"] = "dropoff"
    return create_order(body, db, p)

@dropoff.put("/capacity")
def dropoff_capacity(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    day = _today(db)
    if "capacity" in body: day.dropoff_capacity = int(body["capacity"])
    if "open" in body: day.dropoff_open = bool(body["open"])
    audit(db, p.get("sub"), "dropoff.capacity", "operating_day", day.id, None, body)
    db.commit()
    return {"capacity": day.dropoff_capacity, "open": day.dropoff_open}
