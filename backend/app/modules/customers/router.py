"""Customers + services catalogue + store status."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core.database import get_db
from app.core.deps import require_role, audit, get_store_id
from app.models import Customer, Service, OperatingDay, Order, Payment

customers = APIRouter(prefix="/customers", tags=["customers"])
catalogue = APIRouter(tags=["catalogue"])
store = APIRouter(prefix="/store", tags=["store"])

@customers.get("")
def list_customers(q: str = "", db: Session = Depends(get_db), _p: dict = Depends(require_role("staff"))):
    query = db.query(Customer)
    if q:
        like = f"%{q}%"
        query = query.filter((Customer.phone.like(like)) | (Customer.preferred_name.like(like)) | (Customer.first_name.like(like)))
    rows = query.order_by(Customer.created_at.desc()).limit(50).all()
    return [{"id": c.id, "preferred_name": c.preferred_name, "first_name": c.first_name,
             "phone": c.phone, "segment": c.segment, "customer_code": c.customer_code} for c in rows]

@customers.post("", status_code=201)
def create_customer(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    phone = sec.normalize_phone(body.get("phone", ""))
    if db.query(Customer).filter(Customer.phone == phone).first():
        raise HTTPException(409, "That phone number is already registered. Try signing in instead.")
    c = Customer(store_id=get_store_id(), first_name=body.get("first_name", "").strip()[:60],
                 last_name=body.get("last_name", "").strip()[:60],
                 preferred_name=(body.get("preferred_name") or body.get("first_name") or phone).strip()[:60],
                 phone=phone, email=(body.get("email") or "").strip().lower(), registered_via="in_store",
                 registered_by_user_id=p.get("sub", ""))
    db.add(c); db.commit(); db.refresh(c)
    audit(db, p.get("sub"), "customer.create", "customer", c.id, None, {"phone": c.phone}, store_id=c.store_id)
    db.commit()
    return {"id": c.id, "preferred_name": c.preferred_name}

@customers.get("/{cid}")
def get_customer(cid: str, db: Session = Depends(get_db), _p: dict = Depends(require_role("staff"))):
    c = db.query(Customer).get(cid)
    if not c:
        raise HTTPException(404, "We could not find that customer. They may have been removed.")
    orders = db.query(Order).filter(Order.customer_id == cid).all()
    paid = sum((p.amount for o in orders for p in db.query(Payment).filter(Payment.order_id == o.id, Payment.kind == "payment").all()), 0)
    return {"id": c.id, "preferred_name": c.preferred_name, "first_name": c.first_name,
            "last_name": c.last_name, "phone": c.phone, "email": c.email, "segment": c.segment,
            "visits": len(orders), "spend_kobo": paid,
            "orders": [{"id": o.id, "order_no": o.order_no, "status": o.status, "total": o.total} for o in orders[-20:]]}

@catalogue.get("/services")
def list_services(db: Session = Depends(get_db)):
    return [{"id": s.id, "kind": s.kind, "name": s.name, "unit_price": s.unit_price, "is_active": s.is_active}
            for s in db.query(Service).filter(Service.is_active == True).all()]  # noqa: E712

@catalogue.put("/services/{sid}")
def update_service(sid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("owner"))):
    s = db.query(Service).get(sid)
    if not s:
        raise HTTPException(404, "We could not find that service. It may have been removed.")
    before = {"unit_price": s.unit_price, "name": s.name}
    if "unit_price" in body: s.unit_price = int(body["unit_price"])
    if "name" in body: s.name = body["name"]
    if "is_active" in body: s.is_active = bool(body["is_active"])
    audit(db, p.get("sub"), "service.update", "service", sid, before, body)
    db.commit()
    return {"ok": True}

@store.get("/status")
def store_status(db: Session = Depends(get_db)):
    from app.queue.service import estimate_for_new_booking
    from datetime import datetime, timezone
    day = db.query(OperatingDay).order_by(OperatingDay.date.desc()).first()
    est = estimate_for_new_booking(db, 1, datetime.now(timezone.utc))
    from app.core.config import settings as _s
    return {"accepting": bool(day.accepting_bookings if day else True),
            "dropoff_open": bool(day.dropoff_open if day else True),
            "dropoff_capacity": (day.dropoff_capacity if day else 10),
            "wait_minutes": est.get("wait_minutes"),
            "queue_open": day.queue_opens_at if day else "08:00",
            "queue_close": day.queue_closes_at if day else "19:30",
            "payments_online": bool(_s.paystack_configured)}

@store.patch("/status")
def store_patch(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    day = db.query(OperatingDay).order_by(OperatingDay.date.desc()).first()
    if not day:
        raise HTTPException(404, "There is no open day to update. Please refresh and try again.")
    for k in ("accepting_bookings", "dropoff_open", "dropoff_capacity"):
        if k in body:
            setattr(day, k, body[k])
    audit(db, p.get("sub"), "store.status", "operating_day", day.id, None, body)
    db.commit()
    return {"ok": True}
