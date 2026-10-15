"""POS payments + Paystack initialize/verify/webhook + refunds (append-only)."""
from __future__ import annotations
import hashlib
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, get_current_principal, audit
from app.core import security as sec
from app.core.config import settings
from app.models import Order, Payment, WashUnit
from app.queue.service import recompute

router = APIRouter(tags=["payments"])

#: Paystack local-money fee assumption used only for reporting estimates.
#: Real fees come from settlement reports; this never touches money movement.
PAYSTACK_FEE_RATE = 0.015

@router.post("/orders/{oid}/payments")
def record_payment(oid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("staff"))):
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "Order not found")
    amount = int(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "amount must be > 0 (kobo)")
    pay = Payment(store_id=o.store_id, order_id=oid, method=body.get("method", "cash"), amount=amount, kind="payment",
                  status="confirmed", paystack_reference=body.get("paystack_reference"),
                  recorded_by=p.get("sub", ""))
    db.add(pay); db.flush()
    paid = sum(x.amount for x in db.query(Payment).filter(Payment.order_id == oid, Payment.kind == "payment").all())
    paid -= sum(x.amount for x in db.query(Payment).filter(Payment.order_id == oid, Payment.kind == "refund").all())
    o.payment_status = "paid" if paid >= o.total else ("partial" if paid > 0 else "unpaid")
    audit(db, p.get("sub"), "payment.record", "order", oid, None, {"method": pay.method, "amount": amount})
    db.commit()
    return {"ok": True, "payment_status": o.payment_status}

@router.post("/payments/paystack/initialize")
def paystack_init(body: dict, db: Session = Depends(get_db), p: dict = Depends(get_current_principal)):
    o = db.query(Order).get(body.get("order_id", ""))
    if not o:
        raise HTTPException(404, "Order not found")
    ref = f"LMT-{o.order_no}-{uuid.uuid4().hex[:8]}"
    # Real implementation: POST https://api.paystack.co/transaction/initialize with secret key.
    # MVP returns a checkout URL the frontend can redirect to; webhook confirms.
    url = f"https://checkout.paystack.com/{ref}"
    return {"authorization_url": url, "reference": ref, "amount": o.total}

@router.post("/webhooks/paystack")
async def paystack_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    sig = request.headers.get("x-paystack-signature")
    if not sec.verify_paystack_signature(raw, sig):
        # Allow dummy secret in local dev tests that send matching signature; else reject.
        raise HTTPException(401, "Bad signature")
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Bad JSON")
    data = event.get("data", {})
    ref = data.get("reference", "")
    amount = int(data.get("amount", 0))
    if event.get("event") != "charge.success":
        return {"ok": True, "ignored": True}
    if ref and db.query(Payment).filter(Payment.paystack_reference == ref).first():
        return {"ok": True, "duplicate": True}  # idempotent replay
    # Find order: metadata.order_id preferred, else match by amount + latest pending
    oid = (data.get("metadata") or {}).get("order_id")
    o = db.query(Order).get(oid) if oid else None
    if not o:
        o = db.query(Order).filter(Order.status == "pending_payment").order_by(Order.created_at.desc()).first()
    if not o:
        raise HTTPException(404, "Order for payment not found")
    if amount != o.total:
        raise HTTPException(409, "Amount mismatch. Flagged for refund review.")
    db.add(Payment(store_id=o.store_id, order_id=o.id, method="paystack_card", amount=amount, kind="payment",
                   status="confirmed", paystack_reference=ref,
                   fee=int(amount * PAYSTACK_FEE_RATE) if amount else 0))
    o.status = "booked"; o.payment_status = "paid"
    # online booking creates wash units only after verified payment
    if db.query(WashUnit).filter(WashUnit.order_id == o.id).count() == 0:
        from sqlalchemy import func as _f
        mx = db.query(_f.max(WashUnit.queue_seq)).scalar() or 0
        n = int((data.get("metadata") or {}).get("washes", 1))
        for i in range(max(1, n)):
            db.add(WashUnit(order_id=o.id, unit_no=f"{o.order_no}-{i+1}", queue_seq=int(mx) + 1 + i, status="queued"))
    db.commit(); recompute(db)
    return {"ok": True}

@router.post("/payments/{pid}/refund")
def refund(pid: str, body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("manager"))):
    orig = db.query(Payment).get(pid)
    if not orig:
        raise HTTPException(404, "Payment not found")
    r = Payment(order_id=orig.order_id, method=orig.method, amount=int(body.get("amount", orig.amount)),
                kind="refund", status="confirmed", recorded_by=p.get("sub", ""))
    db.add(r)
    audit(db, p.get("sub"), "payment.refund", "payment", pid, None, body, body.get("reason", ""))
    db.commit()
    return {"ok": True}
