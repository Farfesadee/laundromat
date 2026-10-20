"""WebSocket gateway: /ws?token=... Channels are store-scoped, never hardcoded.

Auth: staff/manager/owner JWT (access), customer JWT, or a hashed kiosk
device token provisioned via POST /api/v1/devices (manager+).
"""
from __future__ import annotations
import hashlib
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core import realtime
from app.core.config import settings
from app.core.security import decode_token

router = APIRouter()


def _device_token_valid(token: str) -> bool:
    if not token:
        return False
    digest = hashlib.sha256(token.encode()).hexdigest()
    try:
        from app.core.database import SessionLocal
        from app.models import DeviceToken
        db = SessionLocal()
        try:
            row = db.query(DeviceToken).filter(DeviceToken.token_hash == digest).first()
            return bool(row and row.is_active)
        finally:
            db.close()
    except Exception:
        return False


@router.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    token = ws.query_params.get("token", "")
    store_id = settings.STORE_ID
    channel = ""
    try:
        data = decode_token(token, expect="access")
        role = data.get("role", "customer")
        if role in ("staff", "manager", "owner", "super_admin"):
            channel = f"store:{store_id}:staff"
        else:
            channel = f"customer:{data.get('sub')}"
    except Exception:
        if _device_token_valid(token):
            channel = f"store:{store_id}:tv"
        else:
            await ws.send_text('{"error":"auth"}')
            await ws.close()
            return
    q = realtime.subscribe(channel)
    try:
        await ws.send_text(f'{{"ok":true,"channel":"{channel}"}}')
        while True:
            msg = await q.get()
            await ws.send_text(msg)
    except WebSocketDisconnect:
        pass
    finally:
        realtime.unsubscribe(channel, q)
