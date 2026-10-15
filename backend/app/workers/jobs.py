"""Background jobs: grace-period scheduler, approaching-turn nudges, nightly metrics.

Runs in-process via APScheduler thread when Redis/ARQ is unavailable (local/dev),
and the same functions are registered as ARQ tasks for production.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
import asyncio

def check_grace_periods():
    """Move units past est start (customer not checked in) into grace; alert on expiry."""
    from app.core.database import SessionLocal
    from app.models import WashUnit, Order, Notification
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        changed = 0
        for u in db.query(WashUnit).filter(WashUnit.status == "queued").all():
            est = u.est_wash_start
            if not est:
                continue
            est_aware = est if est.tzinfo else est.replace(tzinfo=timezone.utc)
            if now >= est_aware and not u.grace_started_at:
                o = db.query(Order).get(u.order_id)
                checked = bool(o and o.status in ("checked_in", "in_progress"))
                if not checked:
                    u.status = "grace"
                    u.grace_started_at = now
                    u.grace_expires_at = now + timedelta(minutes=10)
                    try:
                        db.add(Notification(customer_id=o.customer_id if o else "", template="grace_running",
                                            channel="in_app", status="queued",
                                            payload={"unit": u.unit_no, "expires": u.grace_expires_at.isoformat()},
                                            dedupe_key=f"grace:{u.id}:{now.date().isoformat()}"))
                    except Exception:
                        pass
                    changed += 1
        # grace expiry -> staff alert via realtime publish
        expired = [u for u in db.query(WashUnit).filter(WashUnit.status == "grace").all()
                   if u.grace_expires_at and (u.grace_expires_at if u.grace_expires_at.tzinfo else u.grace_expires_at.replace(tzinfo=timezone.utc)) <= now]
        db.commit()
        if expired:
            try:
                from app.core.config import settings as _s
                loop = asyncio.new_event_loop()
                from app.core import realtime as rt
                for u in expired:
                    loop.run_until_complete(rt.publish(f"store:{_s.STORE_ID}:staff",
                        {"alert": "GRACE_EXPIRED", "unit": u.unit_no,
                                                   "text": f"10-MINUTE GRACE PERIOD EXPIRED for {u.unit_no}. Staff should Skip or Check-in"}))
                loop.close()
            except Exception:
                pass
        return {"grace_started": changed, "expired": len(expired)}
    finally:
        db.close()

async def arq_startup(ctx):
    pass

async def arq_shutdown(ctx):
    pass

async def arq_check_grace(ctx):
    return check_grace_periods()

class WorkerSettings:
    functions = [arq_check_grace]
    cron_jobs = []
