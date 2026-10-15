"""
Spinease queue engine - reference implementation (pure function, no I/O).

Given a snapshot of the store (machines + in-flight washes + ordered queue),
project when and where every queued wash unit will start/finish.

Design rules
  * Counts WASH UNITS and MACHINE CAPACITY, never customers.
  * Deterministic: same snapshot -> same output (ties broken by machine id).
  * No database, no clock: `now` is passed in. Easy to unit test.
  * Rework / restarts are already folded into `busy_until` by the service layer.
"""
from __future__ import annotations
import heapq
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional


@dataclass
class Config:
    wash_minutes: int = 35
    dry_minutes: int = 20
    # The load sits in the washer until a dryer is free (physical reality).
    washer_blocked_by_dryer_wait: bool = True


@dataclass
class Washer:
    id: int
    available: bool = True                      # False = maintenance / out of service
    busy_with_wash_until: Optional[datetime] = None   # in-flight wash end (incl. rework)
    unavailable_until: Optional[datetime] = None      # known repair ETA, optional


@dataclass
class Dryer:
    id: int
    available: bool = True
    busy_until: Optional[datetime] = None
    unavailable_until: Optional[datetime] = None


@dataclass
class QueuedUnit:
    unit_id: str          # e.g. "1025-2"
    customer: str         # preferred name (for demo output only)
    seq: int              # queue order; skipped units are re-sequenced to the back


@dataclass
class Placement:
    unit_id: str
    customer: str
    washer_id: Optional[int]
    wash_start: Optional[datetime]
    wash_end: Optional[datetime]
    dryer_id: Optional[int]
    dry_start: Optional[datetime]
    ready_at: Optional[datetime]


def _norm(dt):
    """SQLite returns naive datetimes; API uses aware UTC. Normalise to naive UTC."""
    if dt is None:
        return None
    try:
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        pass
    return dt


def project(now: datetime, cfg: Config, washers: list[Washer], dryers: list[Dryer],
            queue: list[QueuedUnit]) -> list[Placement]:
    from datetime import timezone as _tz
    W = timedelta(minutes=cfg.wash_minutes)
    D = timedelta(minutes=cfg.dry_minutes)
    now = _norm(now)

    # --- dryer heap: (free_at, id). Out-of-service dryers are excluded. ---
    dryer_heap: list[tuple[datetime, int]] = []
    for d in dryers:
        if not d.available and d.unavailable_until is None:
            continue
        d.busy_until = _norm(d.busy_until)
        d.unavailable_until = _norm(d.unavailable_until)
        free = max(now, d.busy_until or now, d.unavailable_until or now)
        dryer_heap.append((free, d.id))
    heapq.heapify(dryer_heap)

    def take_dryer(ready: datetime):
        """Reserve the earliest-free dryer for a load that is ready at `ready`."""
        if not dryer_heap:
            return None, None
        free, did = heapq.heappop(dryer_heap)
        start = max(ready, free)
        heapq.heappush(dryer_heap, (start + D, did))
        return did, start

    # --- washer heap: (free_at, id) ---
    washer_heap: list[tuple[datetime, int]] = []
    in_flight = []
    for w in washers:
        if not w.available and w.unavailable_until is None:
            continue                                   # out of service: never assigned
        w.busy_with_wash_until = _norm(w.busy_with_wash_until)
        w.unavailable_until = _norm(w.unavailable_until)
        if w.busy_with_wash_until:
            in_flight.append((w.busy_with_wash_until, w.id))
        else:
            washer_heap.append((max(now, w.unavailable_until or now), w.id))

    # In-flight washes need dryers too; handle them in order of finishing.
    for wash_end, wid in sorted(in_flight):
        wash_end = max(wash_end, now)
        _, dry_start = take_dryer(wash_end)
        free = dry_start if (cfg.washer_blocked_by_dryer_wait and dry_start) else wash_end
        washer_heap.append((free, wid))
    heapq.heapify(washer_heap)

    # --- place queued units strictly in queue order ---
    out: list[Placement] = []
    for u in sorted(queue, key=lambda x: x.seq):
        if not washer_heap:                            # no usable washer at all
            out.append(Placement(u.unit_id, u.customer, None, None, None, None, None, None))
            continue
        free, wid = heapq.heappop(washer_heap)
        start = max(now, free)
        end = start + W
        did, dry_start = take_dryer(end)
        ready = dry_start + D if dry_start else None
        release = dry_start if (cfg.washer_blocked_by_dryer_wait and dry_start) else end
        heapq.heappush(washer_heap, (release, wid))
        out.append(Placement(u.unit_id, u.customer, wid, start, end, did, dry_start, ready))
    return out


def estimate_new_booking(now, cfg, washers, dryers, queue, n_washes: int):
    """What-if: append n hypothetical units and report wait for the first and last."""
    last = max((q.seq for q in queue), default=0)
    extra = [QueuedUnit(f"new-{i+1}", "NEW", last + 1 + i) for i in range(n_washes)]
    res = project(now, cfg, washers, dryers, queue + extra)
    mine = [p for p in res if p.unit_id.startswith("new-")]
    if not mine or mine[0].wash_start is None:
        return None
    return {"first_start": mine[0].wash_start, "last_start": mine[-1].wash_start,
            "wait_minutes": round((mine[0].wash_start - now).total_seconds() / 60)}
