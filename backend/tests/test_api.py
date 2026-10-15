"""API journey: seed -> staff login -> booking -> queue -> wash lifecycle -> POS -> reports."""
import os, sys
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
    init_db()
    seed()
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "staff@test.com").first():
            db.add(User(store_id=settings.STORE_ID, email="staff@test.com", name="Staff",
                        role="staff", password_hash=sec.hash_password("Staff1234")))
        if not db.query(User).filter(User.email == "manager@test.com").first():
            db.add(User(store_id=settings.STORE_ID, email="manager@test.com", name="Manager",
                        role="manager", password_hash=sec.hash_password("Manager1234"),
                        pin_hash=sec.hash_pin("4321")))
        db.commit()
    finally:
        db.close()
    return TestClient(app)

def _login(c: TestClient, email: str, password: str):
    r = c.post("/api/v1/auth/staff/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

def test_full_staff_journey():
    c = _client()
    h = _login(c, "staff@test.com", "Staff1234")
    r = c.get("/api/v1/queue/estimate?washes=2")
    assert r.status_code == 200 and r.json()["wait_minutes"] is not None
    r = c.post("/api/v1/orders", json={"phone": "+2348010001111", "preferred_name": "Testy", "washes": 2}, headers=h)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    r = c.get("/api/v1/queue", headers=h)
    assert any(u["order_id"] == oid for u in r.json())
    assert c.post(f"/api/v1/orders/{oid}/check-in", headers=h).status_code == 200
    units = [u for u in c.get("/api/v1/queue", headers=h).json() if u["order_id"] == oid]
    m = c.get("/api/v1/machines", headers=h).json()
    washer = next(x for x in m if x["kind"] == "washer" and x["status"] == "available")
    assert c.post(f"/api/v1/wash-units/{units[0]['id']}/start", json={"machine_id": washer["id"]}, headers=h).status_code == 200
    o = c.get(f"/api/v1/orders/{oid}", headers=h).json()
    assert c.post(f"/api/v1/orders/{oid}/payments", json={"method": "cash", "amount": o["total"]}, headers=h).status_code == 200
    mh = _login(c, "manager@test.com", "Manager1234")
    assert c.get("/api/v1/reports/reconciliation", headers=mh).status_code == 200

def test_public_and_tv_payload_no_pii():
    c = _client()
    r = c.get("/api/v1/queue/public")
    assert r.status_code == 200
    for row in r.json()["now_serving"] + r.json()["coming_up"]:
        assert "phone" not in row and "email" not in row and "total" not in row
        assert set(row) <= {"time", "name", "machine", "status"}
