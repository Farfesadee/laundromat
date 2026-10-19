"""POS payments, real Paystack initialize/verify/webhook, refunds.

Money is always integer kobo. Cards are only offered when a real
PAYSTACK_SECRET_KEY is configured; otherwise the store takes payment
in person and no fake checkout URL is ever produced.
"""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

import httpx

from app.core.database import get_db
from app.core.deps import require_role, get_current_principal, audit
from app.core import security as sec
from app.core.config import settings
from app.models import Customer, Order, OrderItem, Payment, WashUnit
from app.queue.service import recompute

router = APIRouter(tags=["payments"])

PAYSTACK_API = "https://api.paystack.co"
PAYSTACK_TIMEOUT = 20.0
PAYSTACK_FEE_RATE = 0.015


def _paystack_key() -> str:
    """Return a usable secret key, or an empty string when not configured."""
    if not settings.paystack_configured:
        return ""
    return (settings.PAYSTACK_SECRET_KEY or "").strip()


def _order_for(db: Session, oid: str, principal: dict) -> Order:
    o = db.query(Order).get(oid)
    if not o:
        raise HTTPException(404, "Order not found")
    if principal.get("role") == "customer" and o.customer_id != principal.get("sub"):
        raise HTTPException(403, "This order belongs to another customer")
    return o


def _washes_for(db: Session, o: Order) -> int:
    first = (db.query(OrderItem).filter(OrderItem.order_id == o.id)
             .order_by(OrderItem.created_at).first())
    return max(1, int(first.qty)) if first else 1


def _apply_success(db: Session, o: Order, reference: str, amount: int, metadata: dict) -> bool:
    """Idempotently confirm a Paystack payment and open the queue position."""
    if amount != int(o.total):
        raise HTTPException(409, "Amount mismatch. Flagged for refund review.")
    pay = db.query(Payment).filter(Payment.paystack_reference == reference).first()
    if pay and pay.status == "confirmed":
        return False
    if pay and pay.order_id != o.id:
        raise HTTPException(409, "Payment reference belongs to another order")
    if pay:
        pay.status = "confirmed"
        pay.amount = amount
        pay.method = "paystack_card"
    else:
        db.add(Payment(store_id=o.store_id, order_id=o.id, method="paystack_card",
                       amount=amount, kind="payment", status="confirmed",
                       paystack_reference=reference,
                       fee=int(amount * PAYSTACK_FEE_RATE) if amount else 0))
    o.status = "booked"
    o.payment_status = "paid"
    if db.query(WashUnit).filter(WashUnit.order_id == o.id).count() == 0:
        n = max(1, int(metadata.get("washes") or _washes_for(db, o)))
        mx = db.query(func.max(WashUnit.queue_seq)).scalar() or 0
        for i in range(n):
            db.add(WashUnit(order_id=o.id, unit_no=f"{o.order_no}-{i + 1}",
                            queue_seq=int(mx) + 1 + i, status="queued"))
    audit(db, "paystack", "payment.confirmed", "order", o.id, None,
          {"reference": reference, "amount": amount})
    db.commit()
    recompute(db)
    return True


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
    db.add(pay)
    db.flush()
    paid = sum(x.amount for x in db.query(Payment).filter(Payment.order_id == oid, Payment.kind == "payment").all())
    paid -= sum(x.amount for x in db.query(Payment).filter(Payment.order_id == oid, Payment.kind == "refund").all())
    o.payment_status = "paid" if paid >= o.total else ("partial" if paid > 0 else "unpaid")
    audit(db, p.get("sub"), "payment.record", "order", oid, None, {"method": pay.method, "amount": amount})
    db.commit()
    return {"ok": True, "payment_status": o.payment_status}


@router.post("/payments/paystack/initialize")
def paystack_init(body: dict, db: Session = Depends(get_db), p: dict = Depends(get_current_principal)):
    key = _paystack_key()
    if not key:
        raise HTTPException(503, "Card payments are not configured yet. Choose pay in store.")
    o = _order_for(db, body.get("order_id", ""), p)
    if o.status == "cancelled":
        raise HTTPException(409, "This order was cancelled")
    if o.payment_status == "paid":
        raise HTTPException(409, "This order is already paid")
    if int(o.total) <= 0:
        raise HTTPException(400, "Order total must be greater than zero")

    customer = db.query(Customer).get(o.customer_id)
    email = (body.get("email") or (customer.email if customer else "") or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "A valid email address is required for card payment")
    if customer and not customer.email:
        customer.email = email
        db.commit()

    reference = f"LMT-{o.order_no}-{uuid.uuid4().hex[:10]}"
    db.add(Payment(store_id=o.store_id, order_id=o.id, method="paystack_card",
                   amount=int(o.total), kind="payment", status="pending",
                   paystack_reference=reference))
    db.commit()

    payload = {
        "email": email,
        "amount": int(o.total),
        "currency": "NGN",
        "reference": reference,
        "callback_url": settings.PAYSTACK_CALLBACK_URL,
        "metadata": {"order_id": o.id, "order_no": o.order_no,
                     "washes": _washes_for(db, o)},
    }
    try:
        with httpx.Client(timeout=PAYSTACK_TIMEOUT) as client:
            res = client.post(f"{PAYSTACK_API}/transaction/initialize",
                              json=payload, headers={"Authorization": f"Bearer {key}"})
        data = res.json()
    except (httpx.HTTPError, ValueError):
        _mark_failed(db, reference)
        raise HTTPException(502, "Could not reach Paystack. Please try again.")
    if res.status_code >= 400 or not data.get("status"):
        _mark_failed(db, reference)
        raise HTTPException(502, data.get("message") or "Paystack could not start this payment")
    auth = (data.get("data") or {}).get("authorization_url")
    if not auth:
        _mark_failed(db, reference)
        raise HTTPException(502, "Paystack did not return a checkout URL")
    return {"authorization_url": auth, "reference": reference, "amount": int(o.total), "email": email}


def _mark_failed(db: Session, reference: str) -> None:
    pay = db.query(Payment).filter(Payment.paystack_reference == reference).first()
    if pay:
        pay.status = "failed"
        db.commit()


@router.get("/payments/paystack/verify")
def paystack_verify(reference: str = Query(..., min_length=6), db: Session = Depends(get_db)):
    """Verify a callback reference directly with Paystack. Safe to call twice."""
    key = _paystack_key()
    if not key:
        raise HTTPException(503, "Card payments are not configured")
    pay = db.query(Payment).filter(Payment.paystack_reference == reference).first()
    if not pay:
        raise HTTPException(404, "Unknown payment reference")
    o = db.query(Order).get(pay.order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    try:
        with httpx.Client(timeout=PAYSTACK_TIMEOUT) as client:
            res = client.get(f"{PAYSTACK_API}/transaction/verify/{reference}",
                             headers={"Authorization": f"Bearer {key}"})
        data = res.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Could not reach Paystack. Please try again.")
    if res.status_code >= 400 or not data.get("status"):
        raise HTTPException(502, data.get("message") or "Paystack verification failed")
    tx = data.get("data") or {}
    if tx.get("status") != "success":
        return {"ok": False, "payment_status": tx.get("status") or "pending",
                "order_id": o.id, "order_no": o.order_no}
    _apply_success(db, o, reference, int(tx.get("amount") or 0), tx.get("metadata") or {})
    return {"ok": True, "order_id": o.id, "order_no": o.order_no,
            "status": o.status, "payment_status": o.payment_status}


@router.post("/webhooks/paystack")
async def paystack_webhook(request: Request, db: Session = Depends(get_db)):
    key = _paystack_key()
    if not key:
        raise HTTPException(503, "Paystack is not configured")
    raw = await request.body()
    sig = request.headers.get("x-paystack-signature")
    if not sec.verify_paystack_signature(raw, sig):
        raise HTTPException(401, "Bad signature")
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Bad JSON")
    data = event.get("data", {})
    reference = data.get("reference", "")
    amount = int(data.get("amount", 0))
    if event.get("event") != "charge.success":
        return {"ok": True, "ignored": True}
    if data.get("status") not in (None, "success"):
        return {"ok": True, "ignored": True}
    if not reference:
        raise HTTPException(400, "Missing reference")

    oid = (data.get("metadata") or {}).get("order_id")
    o = db.query(Order).get(oid) if oid else None
    if not o:
        pay = db.query(Payment).filter(Payment.paystack_reference == reference).first()
        o = db.query(Order).get(pay.order_id) if pay else None
    if not o:
        raise HTTPException(404, "Order for payment not found")

    changed = _apply_success(db, o, reference, amount, data.get("metadata") or {})
    return {"ok": True, "duplicate": not changed}


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
