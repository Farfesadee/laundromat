"""Paystack webhook: signature, replay idempotency, amount mismatch."""
import os, sys, json, hashlib, hmac
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, init_db
from app.core import security as sec
from app.core.config import settings
from app.models import User
from app.scripts.seed import seed

DB = os.path.join(os.path.dirname(__file__), "..", "laundromat.db")

def _client():
    from app.core.database import engine, Base
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    init_db(); seed()
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "staff@test.com").first():
            db.add(User(store_id=settings.STORE_ID, email="staff@test.com", name="Staff",
                        role="staff", password_hash=sec.hash_password("Staff1234")))
            db.commit()
    finally:
        db.close()
    return TestClient(app)

def _staff(c):
    r = c.post("/api/v1/auth/staff/login", json={"email": "staff@test.com", "password": "Staff1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

def _sign(body: bytes):
    return hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), body, hashlib.sha512).hexdigest()

def test_webhook_replay_and_mismatch():
    c = _client(); h = _staff(c)
    r = c.post("/api/v1/orders", json={"phone": "+2348031234500", "preferred_name": "Webby",
                                       "washes": 1, "channel": "online"}, headers=h)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]; total = r.json()["total"]
    event = {"event": "charge.success", "data": {"reference": "REF-1", "amount": total,
             "metadata": {"order_id": oid, "washes": 1}}}
    raw = json.dumps(event).encode()
    hd = {"x-paystack-signature": _sign(raw)}
    assert c.post("/api/v1/webhooks/paystack", content=raw, headers={**hd, "Content-Type": "application/json"}).status_code == 200
    r2 = c.post("/api/v1/webhooks/paystack", content=raw, headers={**hd, "Content-Type": "application/json"})
    assert r2.status_code == 200 and r2.json().get("duplicate") is True
    bad = c.post("/api/v1/webhooks/paystack", content=raw, headers={"x-paystack-signature": "nope", "Content-Type": "application/json"})
    assert bad.status_code == 401
    event2 = {"event": "charge.success", "data": {"reference": "REF-2", "amount": total + 100,
              "metadata": {"order_id": oid, "washes": 1}}}
    raw2 = json.dumps(event2).encode()
    hd2 = {"x-paystack-signature": _sign(raw2), "Content-Type": "application/json"}
    assert c.post("/api/v1/webhooks/paystack", content=raw2, headers=hd2).status_code == 409
