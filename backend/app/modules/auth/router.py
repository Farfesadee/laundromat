"""Authentication: customer OTP, staff password login, token rotation, PIN step-up.

Security properties:
- Phones validated to E.164; OTP codes are 6-digit secrets-hashed, single-use,
  expire in 10 min, max 5 attempts, 60s cooldown, 5/hour rate limit.
- Staff passwords: bcrypt + lockout (5 failures -> 15 min). No user enumeration
  (identical error for unknown email vs bad password).
- Refresh tokens are persisted with jti and rotated on every use; logout revokes.
- Manager PIN: rate-limited like a password, every check audited.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core.config import settings
from app.core.constants import (
    LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILURES, OTP_COOLDOWN_SECONDS,
    OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_TTL_MINUTES,
    PIN_LOCKOUT_MINUTES, PIN_MAX_FAILURES, ROLE_MANAGER, ROLE_OWNER, ROLE_STAFF,
)
from app.core.database import get_db
from app.core.deps import _client_ip, audit, get_current_principal, get_store_id, login_locked, record_login, require_role
from app.models import Customer, OtpChallenge, RefreshToken, User
from app.schemas import LoginIn, OTPRequest, OTPVerify, RegisterIn, StaffLoginIn

router = APIRouter(prefix="/auth", tags=["auth"])
_GENERIC = "Invalid credentials"


def _issue_session(db: Session, subject: str, role: str, store_id: str) -> dict:
    access = sec.create_access_token(subject, role)
    token, jti, exp = sec.create_refresh_token(subject, role)
    # naive UTC for SQLite portability
    exp_naive = exp.replace(tzinfo=None)
    db.add(RefreshToken(store_id=store_id, jti=jti, subject_id=subject, role=role, expires_at=exp_naive))
    db.commit()
    return {"access_token": access, "refresh_token": token}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    phone = sec.normalize_phone(body.phone)
    if db.query(Customer).filter(Customer.phone == phone).first():
        raise HTTPException(409, "An account with this phone already exists. Try logging in instead.")
    c = Customer(
        store_id=get_store_id(),
        first_name=body.first_name.strip(), last_name=body.last_name.strip(),
        preferred_name=(body.preferred_name or body.first_name or phone).strip(),
        phone=phone, email=(body.email or "").strip().lower(),
        registered_via="online", segment="new",
    )
    db.add(c)
    db.commit(); db.refresh(c)
    audit(db, c.id, "auth.register", "customer", c.id, None, {"phone": phone}, ip=_client_ip(request), store_id=c.store_id)
    db.commit()
    session = _issue_session(db, c.id, "customer", c.store_id)
    return {"customer": {"id": c.id, "preferred_name": c.preferred_name, "phone": c.phone}, **session}


@router.post("/otp/request")
def otp_request(body: OTPRequest, request: Request, db: Session = Depends(get_db)):
    phone = sec.normalize_phone(body.phone)
    store_id = get_store_id()
    now = datetime.now(timezone.utc)
    hour_ago = (now - timedelta(hours=1)).replace(tzinfo=None)
    recent = db.query(OtpChallenge).filter(OtpChallenge.phone == phone, OtpChallenge.created_at >= hour_ago).count()
    if recent >= OTP_MAX_PER_HOUR:
        raise HTTPException(429, "Too many codes requested. Try again later.")
    last = db.query(OtpChallenge).filter(OtpChallenge.phone == phone).order_by(OtpChallenge.created_at.desc()).first()
    if last and last.created_at:
        created = last.created_at if last.created_at.tzinfo else last.created_at.replace(tzinfo=timezone.utc)
        if (now - created).total_seconds() < OTP_COOLDOWN_SECONDS:
            raise HTTPException(429, "Code already sent. Wait a minute before retrying.")
    code = sec.generate_otp_code()
    db.add(OtpChallenge(store_id=store_id, phone=phone, code_hash=sec.hash_otp(code),
                        expires_at=(now + timedelta(minutes=OTP_TTL_MINUTES)).replace(tzinfo=None),
                        request_ip=_client_ip(request)))
    db.commit()
    # TODO: send via SMS provider adapter. Code is returned ONLY in local env for development.
    resp: dict = {"sent": True}
    if settings.is_local:
        resp["dev_code"] = code
    return resp


@router.post("/otp/verify")
def otp_verify(body: OTPVerify, request: Request, db: Session = Depends(get_db)):
    phone = sec.normalize_phone(body.phone)
    now = datetime.now(timezone.utc)
    ch = (
        db.query(OtpChallenge)
        .filter(OtpChallenge.phone == phone, OtpChallenge.consumed == False)  # noqa: E712
        .order_by(OtpChallenge.created_at.desc()).first()
    )
    if not ch:
        raise HTTPException(401, "Code expired or not requested")
    exp = ch.expires_at if ch.expires_at.tzinfo else ch.expires_at.replace(tzinfo=timezone.utc)
    if now > exp:
        raise HTTPException(401, "Code expired. Request a new one.")
    if ch.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many attempts. Request a new code.")
    ch.attempts += 1
    if not sec.verify_otp(body.code.strip(), ch.code_hash):
        db.commit()
        record_login(db, phone, False, _client_ip(request))
        raise HTTPException(401, "Invalid code")
    ch.consumed = True
    c = db.query(Customer).filter(Customer.phone == phone).first()
    if not c:
        c = Customer(store_id=get_store_id(), phone=phone, preferred_name=phone, first_name="", registered_via="online", segment="new")
        db.add(c); db.flush()
    c.phone_verified_at = now.replace(tzinfo=None)
    db.commit()
    record_login(db, phone, True, _client_ip(request))
    audit(db, c.id, "auth.otp_verify", "customer", c.id, None, None, ip=_client_ip(request), store_id=c.store_id)
    db.commit()
    session = _issue_session(db, c.id, "customer", c.store_id)
    return {"customer_id": c.id, **session}


@router.post("/login")
def customer_login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    # Customers authenticate with OTP; this endpoint starts that flow without
    # revealing whether the phone is registered.
    phone = sec.normalize_phone(body.phone) if body.phone else ""
    if not phone:
        raise HTTPException(400, "phone is required. Start with /auth/otp/request, then /auth/otp/verify.")
    if login_locked(db, phone, LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MINUTES):
        raise HTTPException(429, "Too many attempts. Try again later.")
    return {"next": "/auth/otp/request", "phone": phone}


@router.post("/staff/login")
def staff_login(body: StaffLoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    ip = _client_ip(request)
    if login_locked(db, email, LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MINUTES):
        raise HTTPException(429, "Account temporarily locked. Try again later.")
    u = db.query(User).filter(User.email == email).first()
    ok = bool(u and u.is_active and sec.verify_password(body.password, u.password_hash))
    record_login(db, email, ok, ip)
    if not ok:
        audit(db, None, "auth.staff_login_failed", "user", email, None, None, ip=ip, store_id=get_store_id())
        db.commit()
        raise HTTPException(401, _GENERIC)
    if sec.needs_rehash(u.password_hash):
        u.password_hash = sec.hash_password(body.password)
    audit(db, u.id, "auth.staff_login", "user", u.id, None, None, ip=ip, store_id=u.store_id)
    db.commit()
    session = _issue_session(db, u.id, u.role, u.store_id)
    return {**session, "role": u.role, "name": u.name}


@router.post("/refresh")
def refresh(body: dict, db: Session = Depends(get_db)):
    token = (body.get("refresh_token") or "").strip()
    if not token:
        raise HTTPException(401, "Missing refresh token")
    try:
        data = sec.decode_token(token, expect="refresh")
    except Exception:
        raise HTTPException(401, "Invalid or expired refresh token")
    rec = db.query(RefreshToken).filter(RefreshToken.jti == data.get("jti", "")).first()
    if not rec or rec.revoked:
        raise HTTPException(401, "Refresh token revoked. Please log in again.")
    exp = rec.expires_at if rec.expires_at.tzinfo else rec.expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > exp:
        raise HTTPException(401, "Refresh token expired")
    # rotate: revoke old, issue new pair
    rec.revoked = True
    access = sec.create_access_token(rec.subject_id, rec.role)
    new_token, new_jti, new_exp = sec.create_refresh_token(rec.subject_id, rec.role)
    rec.replaced_by = new_jti
    db.add(RefreshToken(store_id=rec.store_id, jti=new_jti, subject_id=rec.subject_id,
                        role=rec.role, expires_at=new_exp.replace(tzinfo=None)))
    db.commit()
    return {"access_token": access, "refresh_token": new_token}


@router.post("/logout")
def logout(body: dict, db: Session = Depends(get_db)):
    token = (body.get("refresh_token") or "").strip()
    if token:
        try:
            data = sec.decode_token(token, expect="refresh")
            rec = db.query(RefreshToken).filter(RefreshToken.jti == data.get("jti", "")).first()
            if rec:
                rec.revoked = True
                db.commit()
        except Exception:
            pass
    return {"ok": True}


@router.post("/pin/verify")
def pin_verify(body: dict, principal: dict = Depends(require_role(ROLE_STAFF)), db: Session = Depends(get_db)):
    pin = (body.get("pin") or "").strip()
    if not pin:
        raise HTTPException(400, "pin is required")
    key = f"pin:{principal['sub']}"
    if login_locked(db, key, PIN_MAX_FAILURES, PIN_LOCKOUT_MINUTES):
        raise HTTPException(429, "PIN temporarily locked. Try again later.")
    authoriser = None
    for u in db.query(User).filter(User.role.in_((ROLE_MANAGER, ROLE_OWNER)), User.is_active == True).all():  # noqa: E712
        if u.pin_hash and sec.verify_pin(pin, u.pin_hash):
            authoriser = u
            break
    record_login(db, key, authoriser is not None, principal.get("ip", ""))
    audit(db, principal["sub"], "auth.pin_verify", "user",
          authoriser.id if authoriser else "unknown",
          None, {"authorised": bool(authoriser)}, ip=principal.get("ip", ""), store_id=get_store_id())
    db.commit()
    if not authoriser:
        raise HTTPException(403, "Invalid manager PIN")
    return {"authorised": True, "by": authoriser.email, "role": authoriser.role}
