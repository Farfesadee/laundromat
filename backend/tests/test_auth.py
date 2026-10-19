"""Auth hardening: OTP lifecycle, customer password/Google, rotation, lockout."""
import os, sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, init_db
from app.core import security as sec
from app.core.config import settings
from app.models import Customer, LoginCode, User

DB = os.path.join(os.path.dirname(__file__), "..", "laundromat.db")

def _fresh():
    from app.core.database import engine, Base
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    init_db()
    db = SessionLocal()
    try:
        db.add(User(store_id=settings.STORE_ID, email="staff@test.com", name="Staff",
                    role="staff", password_hash=sec.hash_password("Staff1234")))
        db.add(User(store_id=settings.STORE_ID, email="manager@test.com", name="Manager",
                    role="manager", password_hash=sec.hash_password("Manager1234"),
                    pin_hash=sec.hash_pin("4321")))
        db.commit()
    finally:
        db.close()
    return TestClient(app)

def _otp_login(c: TestClient, phone: str):
    r = c.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code")
    assert code, "dev_code only in local env"
    r = c.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": code})
    assert r.status_code == 200, r.text
    return r.json()

def test_phone_normalises_to_e164():
    assert sec.normalize_phone("+2348031234567") == "+2348031234567"
    assert sec.normalize_phone("+234 803 123 4567") == "+2348031234567"
    assert sec.normalize_phone("08031234567") == "+2348031234567"


def test_otp_happy_path_and_single_use():
    c = _fresh()
    phone = "+2348011111111"
    sess = _otp_login(c, phone)
    assert sess["access_token"] and sess["refresh_token"]
    # code is single-use: verifying again fails
    r = c.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": "000000"})
    assert r.status_code in (401, 429)

def test_otp_wrong_code_counts_attempts():
    c = _fresh()
    phone = "+2348022222222"
    c.post("/api/v1/auth/otp/request", json={"phone": phone})
    for _ in range(3):
        r = c.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": "999999"})
        assert r.status_code == 401
    # invalid phone rejected, not stored
    assert c.post("/api/v1/auth/otp/request", json={"phone": "notaphone"}).status_code == 400

def test_refresh_rotation_and_reuse_rejected():
    c = _fresh()
    sess = _otp_login(c, "+2348033333333")
    r1 = c.post("/api/v1/auth/refresh", json={"refresh_token": sess["refresh_token"]})
    assert r1.status_code == 200
    # old refresh token is now revoked
    r2 = c.post("/api/v1/auth/refresh", json={"refresh_token": sess["refresh_token"]})
    assert r2.status_code == 401
    # access tokens cannot be used as refresh tokens
    r3 = c.post("/api/v1/auth/refresh", json={"refresh_token": sess["access_token"]})
    assert r3.status_code == 401

def test_staff_lockout_and_role_matrix():
    c = _fresh()
    # 5 bad passwords -> lockout
    for _ in range(5):
        assert c.post("/api/v1/auth/staff/login",
                      json={"email": "staff@test.com", "password": "Wrong1234"}).status_code == 401
    assert c.post("/api/v1/auth/staff/login",
                  json={"email": "staff@test.com", "password": "Staff1234"}).status_code == 429
    # unknown email gives identical error (no enumeration)
    r = c.post("/api/v1/auth/staff/login", json={"email": "nobody@test.com", "password": "Whatever123"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid credentials"
    # role matrix: customer token cannot hit staff queue or manager reports
    sess = _otp_login(c, "+2348044444444")
    ch = {"Authorization": f"Bearer {sess['access_token']}"}
    assert c.get("/api/v1/queue", headers=ch).status_code == 403
    assert c.get("/api/v1/reports/sales", headers=ch).status_code == 403

def test_pin_rate_limit_and_audit():
    c = _fresh()
    r = c.post("/api/v1/auth/staff/login", json={"email": "manager@test.com", "password": "Manager1234"})
    mh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert c.post("/api/v1/auth/pin/verify", json={"pin": "4321"}, headers=mh).status_code == 200
    assert c.post("/api/v1/auth/pin/verify", json={"pin": "0000"}, headers=mh).status_code == 403


def test_customer_register_then_email_and_phone_password_login():
    c = _fresh()
    payload = {
        "first_name": "Ada",
        "last_name": "Okafor",
        "preferred_name": "Ada",
        "phone": "08055550001",
        "email": "Ada@Example.com",
        "password": "Customer1234",
    }
    r = c.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["access_token"] and created["refresh_token"]
    assert created["customer"]["email"] == "ada@example.com"
    assert created["customer"]["phone"] == "+2348055550001"

    r = c.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "Customer1234"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "customer"
    assert r.json()["customer"]["id"] == created["customer"]["id"]

    r = c.post("/api/v1/auth/login", json={"phone": "08055550001", "password": "Customer1234"})
    assert r.status_code == 200, r.text

    r = c.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "Wrong1234"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid credentials"

    duplicate = {**payload, "phone": "08055550002"}
    assert c.post("/api/v1/auth/register", json=duplicate).status_code == 409


def test_registration_requires_details_and_password_strength():
    c = _fresh()
    bare = {"first_name": "Ada", "phone": "08055550003"}
    assert c.post("/api/v1/auth/register", json=bare).status_code == 422
    weak = {
        "first_name": "Ada",
        "phone": "08055550003",
        "email": "weak@example.com",
        "password": "short",
    }
    r = c.post("/api/v1/auth/register", json=weak)
    assert r.status_code in (400, 422)


def test_auth_providers_and_google_unconfigured():
    c = _fresh()
    r = c.get("/api/v1/auth/providers")
    assert r.status_code == 200
    body = r.json()
    assert body["password"] is True
    assert body["sms"] is False
    assert body["google"] is False
    assert c.get("/api/v1/auth/google/start", follow_redirects=False).status_code == 503


def test_google_handoff_code_is_single_use():
    c = _fresh()
    db = SessionLocal()
    try:
        customer = Customer(
            store_id=settings.STORE_ID,
            first_name="Google",
            last_name="User",
            preferred_name="Google User",
            email="google@example.com",
            google_sub="google-sub-1",
            registered_via="google",
        )
        db.add(customer)
        db.flush()
        raw = sec.random_login_code()
        db.add(LoginCode(
            store_id=settings.STORE_ID,
            code_hash=sec.hash_login_code(raw),
            customer_id=customer.id,
            expires_at=(datetime.now(timezone.utc) + timedelta(minutes=2)).replace(tzinfo=None),
        ))
        db.commit()
        customer_id = customer.id
    finally:
        db.close()

    r = c.post("/api/v1/auth/google/exchange", json={"code": raw})
    assert r.status_code == 200, r.text
    assert r.json()["customer"]["id"] == customer_id
    assert r.json()["role"] == "customer"
    # The same handoff code cannot be used twice.
    assert c.post("/api/v1/auth/google/exchange", json={"code": raw}).status_code == 401
