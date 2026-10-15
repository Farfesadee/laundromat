"""Admin: users, settings, audit, notifications, /me."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, get_current_principal, audit
from app.core import security as sec
from app.models import User, Setting, AuditLog, Notification, Customer

router = APIRouter(tags=["admin"])

@router.get("/me")
def me(p: dict = Depends(get_current_principal), db: Session = Depends(get_db)):
    if p.get("role") == "customer":
        c = db.query(Customer).get(p["sub"])
        orders = []
        if c:
            from app.models import Order
            orders = [{"id": o.id, "order_no": o.order_no, "status": o.status, "total": o.total}
                      for o in db.query(Order).filter(Order.customer_id == c.id).order_by(Order.created_at.desc()).limit(20).all()]
        return {"id": p["sub"], "role": "customer",
                "preferred_name": c.preferred_name if c else "", "orders": orders}
    u = db.query(User).get(p["sub"])
    return {"id": p["sub"], "role": p.get("role"), "email": u.email if u else "", "name": u.name if u else ""}

@router.get("/me/orders")
def my_orders(p: dict = Depends(get_current_principal), db: Session = Depends(get_db)):
    from app.models import Order, WashUnit
    rows = db.query(Order).filter(Order.customer_id == p["sub"]).order_by(Order.created_at.desc()).limit(20).all()
    out = []
    for o in rows:
        units = db.query(WashUnit).filter(WashUnit.order_id == o.id).all()
        out.append({"id": o.id, "order_no": o.order_no, "status": o.status, "total": o.total,
                    "units": [{"unit_no": u.unit_no, "status": u.status, "est_start": u.est_wash_start, "est_ready": u.est_ready_at} for u in units]})
    return out

@router.get("/users")
def list_users(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "active": u.is_active}
            for u in db.query(User).all()]

@router.post("/users", status_code=201)
def create_user(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("owner"))):
    if db.query(User).filter(User.email == body.get("email")).first():
        raise HTTPException(400, "Email exists")
    if not body.get("password"):
        raise HTTPException(400, "password is required. The owner must set an initial password.")
    u = User(email=body["email"], name=body.get("name", ""), role=body.get("role", "staff"),
             password_hash=sec.hash_password(body["password"]),
             pin_hash=sec.hash_pin(body["pin"]) if body.get("pin") else "")
    db.add(u)
    audit(db, p.get("sub"), "user.create", "user", body["email"], None, {"role": u.role})
    db.commit()
    return {"ok": True}

@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return {s.key: s.value for s in db.query(Setting).all()}

@router.put("/settings")
def put_settings(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("owner"))):
    for k, v in body.items():
        s = db.query(Setting).filter(Setting.key == k).first()
        if not s:
            s = Setting(key=k, value=v); db.add(s)
        else:
            s.value = v
    audit(db, p.get("sub"), "settings.update", "settings", "all", None, body)
    db.commit()
    return {"ok": True}

@router.get("/audit")
def list_audit(actor: str = "", action: str = "", db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    q = db.query(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(200)
    rows = q.all()
    if actor: rows = [r for r in rows if r.actor_user_id == actor]
    if action: rows = [r for r in rows if r.action == action]
    return [{"actor": r.actor_user_id, "action": r.action, "entity": f"{r.entity_type}:{r.entity_id}",
             "reason": r.reason, "at": r.occurred_at} for r in rows]

@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db), p: dict = Depends(get_current_principal)):
    rows = db.query(Notification).filter(Notification.customer_id == p["sub"]).order_by(Notification.created_at.desc()).limit(50).all()
    return [{"template": n.template, "status": n.status, "payload": n.payload, "at": n.created_at} for n in rows]
