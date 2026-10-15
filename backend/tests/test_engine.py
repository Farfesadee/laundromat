"""Golden scenario from ARCHITECTURE 5.4 + property checks."""
from datetime import datetime
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "queue"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.queue.engine import Config, Washer, Dryer, QueuedUnit, project, estimate_new_booking

def t(h, m): return datetime(2026, 10, 14, h, m)

def _setup():
    now = t(9, 43)
    cfg = Config(wash_minutes=35, dry_minutes=20)
    washers = [Washer(1, busy_with_wash_until=t(9, 54)), Washer(2, busy_with_wash_until=t(9, 57)),
               Washer(3, busy_with_wash_until=t(10, 8)), Washer(4, busy_with_wash_until=t(10, 12)),
               Washer(5, available=False), Washer(6, busy_with_wash_until=t(10, 16))]
    dryers = [Dryer(i) for i in range(1, 6)]
    q = [QueuedUnit("1025-1", "TOYIN", 1), QueuedUnit("1026-1", "AMAKA", 2), QueuedUnit("1025-2", "TOYIN", 3),
         QueuedUnit("1027-1", "DAVID", 4), QueuedUnit("1025-3", "TOYIN", 5), QueuedUnit("1028-1", "CHIOMA", 6),
         QueuedUnit("1029-1", "KUNLE", 7)]
    return now, cfg, washers, dryers, q

def test_golden_table():
    now, cfg, washers, dryers, q = _setup()
    res = project(now, cfg, washers, dryers, q)
    starts = {p.unit_id: p.wash_start for p in res}
    assert starts["1025-1"] == t(9, 54)
    assert starts["1026-1"] == t(9, 57)
    assert starts["1025-2"] == t(10, 8)
    assert starts["1027-1"] == t(10, 12)
    assert starts["1025-3"] == t(10, 16)
    assert starts["1028-1"] == t(10, 29)
    assert starts["1029-1"] == t(10, 32)

def test_new_booking_wait_60min():
    now, cfg, washers, dryers, q = _setup()
    est = estimate_new_booking(now, cfg, washers, dryers, q, 2)
    assert est["wait_minutes"] == 60

def test_properties_no_double_book_no_early_start():
    now, cfg, washers, dryers, q = _setup()
    res = project(now, cfg, washers, dryers, q)
    # never earlier than now
    assert all(p.wash_start is None or p.wash_start >= now for p in res)
    # queue order respected: starts non-decreasing in seq order
    starts = [p.wash_start for p in res]
    assert starts == sorted(starts)
    # unavailable machine never used
    assert all(p.washer_id != 5 for p in res)
    # adding a unit never speeds up earlier units
    extra = q + [QueuedUnit("new-1", "NEW", 8)]
    res2 = project(now, cfg, washers, dryers, extra)
    by_id = {p.unit_id: p for p in res2}
    for p in res:
        assert by_id[p.unit_id].wash_start >= p.wash_start

def test_dryer_bottleneck_shifts_queue():
    now, cfg, washers, _, q = _setup()
    res = project(now, cfg, washers, [Dryer(1), Dryer(2)], q)
    by_id = {p.unit_id: p for p in res}
    assert by_id["1025-2"].wash_start >= t(10, 8)  # delayed by dryer contention
    assert by_id["1029-1"].wash_start > t(10, 32)
