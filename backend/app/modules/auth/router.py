"""Authentication: customer email/password, Google, OTP, staff login, rotation, PIN.

Security properties:
- Customer passwords: bcrypt (SHA-256 pre-hash), strength checked, lockout on
  repeated failures, and identical errors for unknown accounts and bad passwords.
- Customer emails are unique (case-insensitive) and phones are unique in E.164.
- Google sign in verifies the signed OAuth state and the provider's verified
  email, links by Google subject or email, then hands back a single-use code in
  a URL fragment. The code is exchanged for normal tokens and expires in 2 min.
- Phone OTP codes are 6-digit secrets-hashed, single-use, expire in 10 min,
  max 5 attempts, 60s cooldown, 5/hour rate limit. The code option is only
  advertised when an SMS provider is configured.
- Staff passwords: bcrypt + lockout (5 failures -> 15 min). No user enumeration.
- Refresh tokens are persisted with jti and rotated on every use; logout revokes.
- Manager PIN: rate-limited like a password, every check audited.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
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
from app.models import Customer, LoginCode, OtpChallenge, RefreshToken, User
from app.schemas import GoogleExchangeIn, LoginIn, OTPRequest, OTPVerify, RegisterIn, StaffLoginIn

router = APIRouter(prefix="/auth", tags=["auth"])
_GENERIC = "Invalid credentials"
_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _issue_session(db: Session, subject: str, role: str, store_id: str) -> dict:
    access = sec.create_access_token(subject, role)
    token, jti, exp = sec.create_refresh_token(subject, role)
    # naive UTC for SQLite portability
    exp_naive = exp.replace(tzinfo=None)
    db.add(RefreshToken(store_id=store_id, jti=jti, subject_id=subject, role=role, expires_at=exp_naive))
    db.commit()
    return {"access_token": access, "refresh_token": token}


def _customer_payload(c: Customer) -> dict:
    return {
        "id": c.id,
        "first_name": c.first_name or "",
        "last_name": c.last_name or "",
        "preferred_name": c.preferred_name or "",
        "phone": c.phone or "",
        "email": c.email or "",
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    phone = sec.normalize_phone(body.phone)
    email = str(body.email).strip().lower()
    if db.query(Customer).filter(Customer.phone == phone).first():
        raise HTTPException(409, "An account with this phone already exists. Try signing in instead.")
    if db.query(Customer).filter(func.lower(Customer.email) == email).first():
        raise HTTPException(409, "An account with this email already exists. Try signing in instead.")

    # Validates length + letters/numbers before touching the database.
    password_hash = sec.hash_password(body.password)
    c = Customer(
        store_id=get_store_id(),
        first_name=body.first_name.strip(), last_name=body.last_name.strip(),
        preferred_name=(body.preferred_name or body.first_name or phone).strip(),
        phone=phone, email=email, password_hash=password_hash,
        registered_via="online", segment="new",
    )
    db.add(c)
    try:
        db.commit(); db.refresh(c)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email or phone already exists. Try signing in instead.")
    audit(db, c.id, "auth.register", "customer", c.id, None, {"phone": phone, "email": email}, ip=_client_ip(request), store_id=c.store_id)
    db.commit()
    session = _issue_session(db, c.id, "customer", c.store_id)
    return {"customer": _customer_payload(c), **session}


@router.get("/providers")
def auth_providers(response: Response):
    """Public capability list used by the sign in screen."""
    response.headers["Cache-Control"] = "no-store"
    return {
        "password": True,
        "google": settings.google_oauth_configured,
        "sms": settings.sms_configured,
    }


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
    return {"customer_id": c.id, "customer": _customer_payload(c), "role": "customer", **session}


@router.post("/login")
def customer_login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Email or phone plus password. OTP remains a separate two-step flow."""
    email = (body.email or "").strip().lower()
    phone = ""
    if body.phone:
        try:
            phone = sec.normalize_phone(body.phone)
        except HTTPException:
            raise HTTPException(401, _GENERIC)
    if not body.password:
        raise HTTPException(400, "Password is required. Use the code option to sign in with a one time code.")
    identifier = email or phone
    if not identifier:
        raise HTTPException(400, "Email or phone is required")

    ip = _client_ip(request)
    if login_locked(db, identifier, LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MINUTES):
        raise HTTPException(429, "Too many attempts. Try again later.")

    c = None
    if email:
        c = db.query(Customer).filter(func.lower(Customer.email) == email).first()
    elif phone:
        c = db.query(Customer).filter(Customer.phone == phone).first()

    ok = bool(c and c.password_hash and sec.verify_password(body.password, c.password_hash))
    record_login(db, identifier, ok, ip)
    if not ok:
        audit(db, None, "auth.customer_login_failed", "customer", identifier, None, None, ip=ip, store_id=get_store_id())
        db.commit()
        raise HTTPException(401, _GENERIC)
    if sec.needs_rehash(c.password_hash):
        c.password_hash = sec.hash_password(body.password)
    audit(db, c.id, "auth.customer_login", "customer", c.id, None, {"method": "password"}, ip=ip, store_id=c.store_id)
    db.commit()
    session = _issue_session(db, c.id, "customer", c.store_id)
    return {**session, "role": "customer", "customer": _customer_payload(c)}


@router.get("/google/start")
def google_start():
    if not settings.google_oauth_configured:
        raise HTTPException(503, "Google sign in is not configured")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": sec.create_oauth_state(),
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/google/callback", name="google_callback")
def google_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    def fail(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{settings.FRONTEND_URL}/login?error={quote(reason)}", status_code=302)

    if error or not code or not state:
        return fail("google_cancelled")
    try:
        sec.decode_token(state, expect="oauth_state")
    except Exception:
        return fail("google_state")
    if not settings.google_oauth_configured:
        return fail("google_unavailable")

    try:
        with httpx.Client(timeout=15.0) as client:
            token_response = client.post(_GOOGLE_TOKEN_URL, data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            })
            token_response.raise_for_status()
            access_token = (token_response.json() or {}).get("access_token", "")
            if not access_token:
                raise ValueError("missing access token")
            info_response = client.get(_GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
            info_response.raise_for_status()
            info = info_response.json() or {}
    except Exception:
        return fail("google_exchange")

    email = str(info.get("email") or "").strip().lower()
    google_sub = str(info.get("sub") or "").strip()
    verified = info.get("email_verified") in (True, "true", "1")
    if not email or not google_sub or not verified:
        return fail("google_email")

    c = db.query(Customer).filter(Customer.google_sub == google_sub).first()
    if not c:
        c = db.query(Customer).filter(func.lower(Customer.email) == email).first()
        if c:
            if c.google_sub and c.google_sub != google_sub:
                return fail("google_conflict")
            c.google_sub = google_sub
        else:
            c = Customer(
                store_id=get_store_id(),
                first_name=str(info.get("given_name") or "").strip(),
                last_name=str(info.get("family_name") or "").strip(),
                preferred_name=str(info.get("name") or "").strip() or email.split("@")[0],
                email=email,
                phone=None,
                google_sub=google_sub,
                registered_via="google",
                segment="new",
            )
            db.add(c)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                return fail("google_conflict")

    raw_code = sec.random_login_code()
    db.add(LoginCode(
        store_id=c.store_id,
        code_hash=sec.hash_login_code(raw_code),
        customer_id=c.id,
        expires_at=(datetime.now(timezone.utc) + timedelta(minutes=2)).replace(tzinfo=None),
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return fail("google_conflict")
    audit(db, c.id, "auth.google_login", "customer", c.id, None, {"linked": bool(c.google_sub)}, ip=_client_ip(request), store_id=c.store_id)
    db.commit()
    # The code is carried in the fragment so it is never sent in a server request line.
    return RedirectResponse(f"{settings.FRONTEND_URL}/auth/google/callback#code={quote(raw_code)}", status_code=302)


@router.post("/google/exchange")
def google_exchange(body: GoogleExchangeIn, request: Request, db: Session = Depends(get_db)):
    raw_code = body.code.strip()
    if not raw_code:
        raise HTTPException(400, "code is required")
    now = datetime.now(timezone.utc)
    rec = (
        db.query(LoginCode)
        .filter(LoginCode.code_hash == sec.hash_login_code(raw_code), LoginCode.consumed == False)  # noqa: E712
        .first()
    )
    if not rec:
        raise HTTPException(401, "This sign in link is invalid or has already been used.")
    exp = rec.expires_at if rec.expires_at.tzinfo else rec.expires_at.replace(tzinfo=timezone.utc)
    if now > exp:
        raise HTTPException(401, "This sign in link has expired. Try again.")
    rec.consumed = True
    c = db.query(Customer).filter(Customer.id == rec.customer_id).first()
    if not c:
        raise HTTPException(401, _GENERIC)
    db.commit()
    audit(db, c.id, "auth.google_exchange", "customer", c.id, None, None, ip=_client_ip(request), store_id=c.store_id)
    db.commit()
    session = _issue_session(db, c.id, "customer", c.store_id)
    return {**session, "role": "customer", "customer": _customer_payload(c)}


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
