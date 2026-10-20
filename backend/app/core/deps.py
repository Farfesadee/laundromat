"""RBAC + authenticated-principal loading + audit. No hardcoded store ids."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import ROLE_RANK
from app.core.database import get_db
from app.core.security import decode_token
from app.models import AuditLog, Customer, LoginAttempt, User

bearer = HTTPBearer(auto_error=False)


def get_store_id() -> str:
    return settings.STORE_ID


def _client_ip(request: Request | None) -> str:
    if request is None:
        return ""
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else ""))


def get_current_principal(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue.",
        )
    try:
        data = decode_token(creds.credentials, expect="access")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has ended. Please sign in again.",
        )
    sub, role = data.get("sub", ""), data.get("role", "customer")
    # Load the principal from the DB so deactivated accounts lose access immediately.
    active = False
    name = ""
    if role in ("staff", "manager", "owner", "super_admin"):
        u = db.query(User).filter(User.id == sub).first()
        if u and u.is_active:
            active, name = True, u.name
    elif role == "customer":
        c = db.query(Customer).filter(Customer.id == sub).first()
        active, name = (c is not None), (c.preferred_name if c else "")
    else:
        raise HTTPException(403, detail="Your account role is not recognized. Contact an administrator.")
    if not active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account is disabled. Contact an administrator.",
        )
    return {"sub": sub, "role": role, "name": name, "jti": data.get("jti", ""), "ip": _client_ip(request)}


def require_role(*roles: str):
    want = max(ROLE_RANK.get(r, 0) for r in roles)

    def _dep(principal: dict = Depends(get_current_principal)) -> dict:
        if ROLE_RANK.get(principal.get("role", "customer"), 0) < want:
            raise HTTPException(403, detail="You do not have access to that.")
        return principal

    return _dep


def login_locked(db: Session, identifier: str, max_failures: int, window_minutes: int) -> bool:
    since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    fails = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.identifier == identifier, LoginAttempt.success == False, LoginAttempt.created_at >= since)  # noqa: E712
        .count()
    )
    return fails >= max_failures


def record_login(db: Session, identifier: str, success: bool, ip: str = "") -> None:
    db.add(LoginAttempt(store_id=get_store_id(), identifier=identifier, success=success, ip=ip))
    db.commit()


def audit(
    db: Session,
    actor: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    ip: str = "",
    store_id: str | None = None,
):
    db.add(
        AuditLog(
            store_id=store_id or get_store_id(),
            actor_user_id=actor or "",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            before=before or {},
            after=after or {},
            reason=reason or "",
            ip=ip,
        )
    )
