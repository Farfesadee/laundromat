"""Kiosk device tokens (store TV). Manager+ can provision/rotate/revoke."""
from __future__ import annotations
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import audit, get_store_id, require_role
from app.models import DeviceToken

router = APIRouter(prefix="/devices", tags=["devices"])

@router.post("")
def provision(body: dict, db: Session = Depends(get_db), p: dict = Depends(require_role("manager"))):
    label = (body.get("label") or "tv").strip()[:40]
    raw = f"lmtv_{secrets.token_urlsafe(32)}"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    db.add(DeviceToken(store_id=get_store_id(), label=label, token_hash=digest, created_by=p.get("sub", "")))
    audit(db, p.get("sub"), "device.provision", "device", label, None, None, store_id=get_store_id())
    db.commit()
    # The raw token is shown ONCE. The operator pastes it into the TV kiosk URL.
    return {"label": label, "token": raw}

@router.get("")
def list_devices(db: Session = Depends(get_db), _p: dict = Depends(require_role("manager"))):
    return [{"label": d.label, "active": d.is_active, "created_at": d.created_at}
            for d in db.query(DeviceToken).filter(DeviceToken.store_id == get_store_id()).all()]

@router.post("/{label}/revoke")
def revoke(label: str, db: Session = Depends(get_db), p: dict = Depends(require_role("manager"))):
    rows = db.query(DeviceToken).filter(DeviceToken.store_id == get_store_id(), DeviceToken.label == label).all()
    if not rows:
        raise HTTPException(404, "We could not find that device. It may have been removed.")
    for r in rows:
        r.is_active = False
    audit(db, p.get("sub"), "device.revoke", "device", label, None, None, store_id=get_store_id())
    db.commit()
    return {"ok": True}
