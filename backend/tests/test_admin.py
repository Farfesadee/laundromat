"""Super admin visibility and control. Every route is owner protected."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

from app.core import security as sec
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, init_db
from app.main import app
from app.models import Customer, Machine, Service, User
from app.scripts.seed import seed


def _client() -> TestClient:
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    init_db()
    seed()
    db = SessionLocal()
    try:
        db.add(
            User(
                store_id=settings.STORE_ID,
                email="owner@test.com",
                name="Owner",
                role="owner",
                password_hash=sec.hash_password("Owner1234"),
                pin_hash=sec.hash_pin("4321"),
            )
        )
        db.add(
            User(
                store_id=settings.STORE_ID,
                email="staff@test.com",
                name="Staff",
                role="staff",
                password_hash=sec.hash_password("Staff1234"),
            )
        )
        db.commit()
    finally:
        db.close()
    return TestClient(app)


def _login(c: TestClient, email: str, password: str) -> dict:
    r = c.post("/api/v1/auth/staff/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _owner(c: TestClient) -> dict:
    return _login(c, "owner@test.com", "Owner1234")


def test_staff_cannot_open_admin_console():
    c = _client()
    h = _login(c, "staff@test.com", "Staff1234")
    assert c.get("/api/v1/admin/overview", headers=h).status_code == 403
    assert c.get("/api/v1/admin/orders", headers=h).status_code == 403
    assert c.get("/api/v1/admin/settings", headers=h).status_code == 403


def test_overview_and_every_read_surface():
    c = _client()
    h = _owner(c)
    created = c.post(
        "/api/v1/orders",
        json={"phone": "+2348011112222", "preferred_name": "Admin Test", "washes": 1},
        headers=h,
    )
    assert created.status_code == 200, created.text
    oid = created.json()["id"]

    overview = c.get("/api/v1/admin/overview", headers=h)
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["stats"]["orders_today"] >= 1
    assert body["live_queue"]
    assert len(body["machines"]) >= 1
    assert any(row["id"] == oid for row in body["recent_orders"])

    for path in (
        "/api/v1/admin/orders",
        "/api/v1/admin/customers",
        "/api/v1/admin/team",
        "/api/v1/admin/services",
        "/api/v1/admin/machines",
        "/api/v1/admin/settings",
        "/api/v1/admin/payments",
        "/api/v1/admin/audit",
    ):
        r = c.get(path, headers=h)
        assert r.status_code == 200, (path, r.text)

    detail = c.get(f"/api/v1/admin/orders/{oid}", headers=h)
    assert detail.status_code == 200, detail.text
    assert detail.json()["customer_detail"]["name"] == "Admin Test"


def test_team_machine_service_customer_and_settings_changes():
    c = _client()
    h = _owner(c)

    r = c.post(
        "/api/v1/admin/team",
        json={
            "email": "new.manager@test.com",
            "name": "New Manager",
            "role": "manager",
            "password": "Manager1234",
            "pin": "2468",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    team = c.get("/api/v1/admin/team", headers=h).json()
    assert any(u["id"] == uid and u["role"] == "manager" and u["has_pin"] for u in team)
    assert c.post(
        "/api/v1/auth/staff/login",
        json={"email": "new.manager@test.com", "password": "Manager1234"},
    ).status_code == 200
    assert c.patch(
        f"/api/v1/admin/team/{uid}", json={"is_active": False}, headers=h
    ).status_code == 200
    assert c.post(
        "/api/v1/auth/staff/login",
        json={"email": "new.manager@test.com", "password": "Manager1234"},
    ).status_code == 401

    r = c.post(
        "/api/v1/admin/machines",
        json={"kind": "washer", "label": "W9", "status": "available"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    assert c.patch(
        f"/api/v1/admin/machines/{mid}",
        json={"status": "maintenance", "reason": "service visit"},
        headers=h,
    ).status_code == 200

    r = c.post(
        "/api/v1/admin/services",
        json={"kind": "retail", "name": "Laundry Bag", "unit_price": 250000},
        headers=h,
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert c.patch(
        f"/api/v1/admin/services/{sid}",
        json={"unit_price": 300000, "is_active": False},
        headers=h,
    ).status_code == 200

    r = c.post(
        "/api/v1/customers",
        json={"first_name": "Ada", "preferred_name": "Ada", "phone": "+2348022223333"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert c.patch(
        f"/api/v1/admin/customers/{cid}",
        json={"email": "ada@example.com", "segment": "regular"},
        headers=h,
    ).status_code == 200
    customer = c.get(f"/api/v1/customers/{cid}", headers=h).json()
    assert customer["email"] == "ada@example.com"

    r = c.put(
        "/api/v1/admin/settings",
        json={
            "settings": {"wash_minutes": 40, "grace_minutes": 12, "wash_price_kobo": 450000},
            "day": {"accepting_bookings": False, "dropoff_capacity": 14},
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    settings_body = c.get("/api/v1/admin/settings", headers=h).json()
    assert settings_body["settings"]["wash_minutes"] == 40
    assert settings_body["settings"]["grace_minutes"] == 12
    assert settings_body["day"]["accepting_bookings"] is False
    assert settings_body["day"]["dropoff_capacity"] == 14

    assert c.get("/api/v1/admin/audit", headers=h).status_code == 200
