"""Reports: sales, reconciliation (expected vs actual), customers, operations, close day."""
from __future__ import annotations
from collections import Counter
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, audit
from app.models import Order, Payment, WashUnit, Machine, Customer, OperatingDay, DailyClose, ReworkEvent

router = APIRouter(prefix="/reports", tags=["reports"])
days = APIRouter(prefix="/days", tags=["days"])

def _expected(db: Session):
    by_method: Counter = Counter(); total = 0; n = 0
    for o in db.query(Order).filter(Order.status != "cancelled").all():
        # intended method: latest payment method or 'unpaid'
        pays = db.query(Payment).filter(Payment.order_id == o.id, Payment.kind == "payment").all()
        method = pays[-1].method if pays else "unpaid"
        by_method[method] += o.total; total += o.total; n += 1
    return {"total": total, "orders": n, "by_method": dict(by_method)}

def _actual(db: Session):
    by_method: Counter = Counter(); total = 0
    for p in db.query(Payment).all():
        sign = 1 if p.kind == "payment" else -1
        by_method[p.method] += sign * p.amount; total += sign * p.amount
    return {"total": total, "by_method": dict(by_method)}

@router.get("/sales")
def sales(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    return {"expected": _expected(db), "actual": _actual(db)}

@router.get("/reconciliation")
def reconciliation(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    exp, act = _expected(db), _actual(db)
    methods = set(exp["by_method"]) | set(act["by_method"])
    variance = {m: act["by_method"].get(m, 0) - exp["by_method"].get(m, 0) for m in methods}
    outstanding = sum(o.total - sum(p.amount for p in db.query(Payment).filter(Payment.order_id == o.id, Payment.kind == "payment").all())
                      for o in db.query(Order).filter(Order.payment_status.in_(("unpaid", "partial"))).all())
    return {"expected": exp, "actual": act, "variance": variance,
            "variance_total": act["total"] - exp["total"], "outstanding_kobo": outstanding,
            "flagged": (act["total"] - exp["total"]) != 0}

@router.get("/customers")
def customers_report(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    rows = db.query(Customer).all()
    return {"total": len(rows), "segments": dict(Counter(c.segment or "new" for c in rows))}

@router.get("/operations")
def operations(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    units = db.query(WashUnit).all()
    by_status = dict(Counter(u.status for u in units))
    waits = []
    for u in units:
        if u.est_wash_start and u.created_at:
            try:
                waits.append((u.est_wash_start - u.created_at.replace(tzinfo=None)).total_seconds() / 60)
            except Exception:
                pass
    avg_wait = round(sum(waits) / len(waits), 1) if waits else 0
    return {"washes": len(units), "by_status": by_status, "avg_wait_min": avg_wait,
            "reworks": db.query(ReworkEvent).count(),
            "machines_down": db.query(Machine).filter(Machine.status.in_(("error", "maintenance"))).count()}

@router.get("/utilisation")
def utilisation(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    out = []
    for m in db.query(Machine).all():
        out.append({"label": m.label, "kind": m.kind, "status": m.status})
    return out

@days.get("/{date}")
def day_view(date: str, db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    d = db.query(OperatingDay).filter(OperatingDay.date == date).first()
    if not d:
        return {"date": date, "exists": False}
    orders = db.query(Order).filter(Order.operating_day_id == d.id).all()
    return {"date": date, "status": d.status, "orders": len(orders),
            "expected": sum(o.total for o in orders if o.status != "cancelled")}

@days.post("/{date}/close")
def close_day(date: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("manager"))):
    d = db.query(OperatingDay).filter(OperatingDay.date == date).first()
    if not d:
        from fastapi import HTTPException
        raise HTTPException(404, "We could not find that operating day. It may have been removed.")
    exp, act = _expected(db), _actual(db)
    snap = {"date": date, "expected": exp, "actual": act, "notes": body.get("notes", ""),
            "closed_by": p.get("sub", ""), "closed_at": datetime.utcnow().isoformat()}
    dc = DailyClose(operating_day_id=d.id, expected=exp, actual=act,
                    variance={"total": act["total"] - exp["total"]},
                    notes=body.get("notes", ""), closed_by=p.get("sub", ""), snapshot=snap)
    db.add(dc); d.status = "closed"
    audit(db, p.get("sub"), "day.close", "operating_day", d.id, None, snap)
    db.commit()
    return {"ok": True, "snapshot": snap}
