"""recompute(): snapshot DB -> project() -> persist -> publish -> notify.

Pure projection lives in engine.py; this layer folds DB state (rework,
restarts, downtime) into busy_until, exactly as ARCHITECTURE 5.2 describes.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.queue.engine import Config, Dryer, QueuedUnit, Washer, project, estimate_new_booking
from app.models import Machine, WashUnit, Order, Customer, Notification, Setting


def _default_store() -> str:
    from app.core.config import settings
    return settings.STORE_ID


def _cfg(db: Session, store_id: str | None = None) -> Config:
    from app.core.constants import DEFAULTS, SETTING_DRY_MINUTES, SETTING_WASH_MINUTES
    store_id = store_id or _default_store()
    wash, dry, blocking = DEFAULTS[SETTING_WASH_MINUTES], DEFAULTS[SETTING_DRY_MINUTES], True
    try:
        rows = {s.key: s.value for s in db.query(Setting).filter(Setting.store_id == store_id).all()}
        wash = int((rows.get("wash_minutes") or {}).get("v", wash)) if isinstance(rows.get("wash_minutes"), dict) else int(rows.get("wash_minutes", wash))
        dry = int((rows.get("dry_minutes") or {}).get("v", dry)) if isinstance(rows.get("dry_minutes"), dict) else int(rows.get("dry_minutes", dry))
    except Exception:
        pass
    return Config(wash_minutes=wash, dry_minutes=dry, washer_blocked_by_dryer_wait=blocking)

def snapshot(db: Session, store_id: str | None = None):
    store_id = store_id or _default_store()
    cfg = _cfg(db, store_id)
    machines = db.query(Machine).filter(Machine.store_id == store_id).all()
    washers, dryers = [], []
    by_id = {}
    for m in machines:
        by_id[m.id] = m
        if m.kind == "washer":
            busy = m.busy_until
            # in-flight wash end: prefer busy_until, else derive from running unit
            washers.append(Washer(id=int(''.join(filter(str.isdigit, m.label)) or 0) or abs(hash(m.id)) % 10**6,
                                  available=(m.status != "maintenance" and not (not m.status == "available" and m.status == "maintenance")),
                                  busy_with_wash_until=busy,
                                  unavailable_until=m.unavailable_until))
            # fix availability flag + numeric id mapping
            washers[-1].available = (m.status not in ("maintenance",))
            washers[-1].id = m.id  # keep str id internally? engine expects int-ish; we map below
        else:
            dryers.append(Dryer(id=m.id, available=(m.status != "maintenance"),
                                busy_until=m.busy_until, unavailable_until=m.unavailable_until))
    # Engine uses (free_at, id) tuples; ids may be str -> keep str, heap compares free first then id.
    # To keep deterministic order with str ids, this is fine.
    units = (db.query(WashUnit, Order, Customer)
             .join(Order, WashUnit.order_id == Order.id)
             .join(Customer, Order.customer_id == Customer.id, isouter=True)
             .filter(WashUnit.store_id == store_id, WashUnit.status.in_(("queued", "grace")))
             .order_by(WashUnit.queue_seq).all())
    queue = []
    for wu, o, c in units:
        queue.append(QueuedUnit(unit_id=wu.unit_no, customer=(c.preferred_name if c and c.preferred_name else (c.first_name if c else "?")),
                               seq=wu.queue_seq))
    return cfg, washers, dryers, queue, units

def _as_engine_washers(db_washers, now):
    # Convert str-id washers to engine objects while preserving heap behaviour
    from app.queue import engine as E
    out = []
    for w in db_washers:
        out.append(E.Washer(id=w.id, available=w.available,
                            busy_with_wash_until=w.busy_with_wash_until,
                            unavailable_until=w.unavailable_until))
    return out

def recompute(db: Session, store_id: str | None = None, now: datetime | None = None):
    """Project queue and persist est_wash_start/est_ready_at + washer assignment preview."""
    from app.queue import engine as E
    store_id = store_id or _default_store()
    now = now or datetime.now(timezone.utc)
    cfg, washers_raw, dryers_raw, queue, units = snapshot(db, store_id)
    ew = [E.Washer(id=w.id, available=w.available, busy_with_wash_until=w.busy_with_wash_until,
                   unavailable_until=w.unavailable_until) for w in washers_raw]
    ed = [E.Dryer(id=d.id, available=d.available, busy_until=d.busy_until,
                  unavailable_until=d.unavailable_until) for d in dryers_raw]
    placements = E.project(now, cfg, ew, ed, queue)
    by_unit = {p.unit_id: p for p in placements}
    changed = 0
    for wu, o, c in units:
        p = by_unit.get(wu.unit_no)
        if not p:
            continue
        if wu.est_wash_start != p.wash_start or wu.est_ready_at != p.ready_at:
            # notify on material change (>=5 min); queue a lightweight notification row
            try:
                old = wu.est_wash_start
                if old and p.wash_start and abs((p.wash_start - old).total_seconds()) >= 5 * 60:
                    db.add(Notification(store_id=store_id, customer_id=o.customer_id,
                                        template="eta_changed", channel="in_app", status="queued",
                                        payload={"unit": wu.unit_no, "old": str(old), "new": str(p.wash_start)},
                                        dedupe_key=f"eta_changed:{wu.id}:{p.wash_start}"))
            except Exception:
                pass
            wu.est_wash_start = p.wash_start
            wu.est_ready_at = p.ready_at
            changed += 1
    db.commit()
    return {"placements": [
        {"unit": p.unit_id, "customer": p.customer, "washer": p.washer_id, "start": p.wash_start,
         "wash_end": p.wash_end, "dryer": p.dryer_id, "dry_start": p.dry_start, "ready": p.ready_at}
        for p in placements], "changed": changed}

def estimate_for_new_booking(db: Session, n_washes: int, now: datetime | None = None, store_id: str | None = None):
    from app.queue import engine as E
    store_id = store_id or _default_store()
    now = now or datetime.now(timezone.utc)
    cfg, washers_raw, dryers_raw, queue, _ = snapshot(db, store_id)
    ew = [E.Washer(id=w.id, available=w.available, busy_with_wash_until=w.busy_with_wash_until,
                   unavailable_until=w.unavailable_until) for w in washers_raw]
    ed = [E.Dryer(id=d.id, available=d.available, busy_until=d.busy_until,
                  unavailable_until=d.unavailable_until) for d in dryers_raw]
    last = max((q.seq for q in queue), default=0)
    extra = [QueuedUnit(f"new-{i+1}", "NEW", last + 1 + i) for i in range(n_washes)]
    res = E.project(now, cfg, ew, ed, queue + extra)
    mine = [p for p in res if str(p.unit_id).startswith("new-")]
    if not mine or mine[0].wash_start is None:
        return {"accepting": False, "wait_minutes": None, "first_start": None}
    start = mine[0].wash_start
    # engine normalises to naive UTC; make `now` comparable
    now_n = now.replace(tzinfo=None) if getattr(now, "tzinfo", None) else now
    start_n = start.replace(tzinfo=None) if getattr(start, "tzinfo", None) else start
    wait = round((start_n - now_n).total_seconds() / 60)
    return {"accepting": True, "wait_minutes": wait, "first_start": mine[0].wash_start,
            "last_start": mine[-1].wash_start}
