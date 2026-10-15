from datetime import datetime, timedelta
try:
    from app.queue.engine import *  # when run as module: python -m app.queue.demo
except ImportError:  # when run as script inside backend/app/queue/
    from engine import *

def t(h, m): return datetime(2026, 10, 14, h, m)
def f(x): return x.strftime("%I:%M %p").lstrip("0") if x else "-"
now = t(9, 43)
cfg = Config(wash_minutes=35, dry_minutes=20)

def scenario(title, dryers):
    washers = [Washer(1, busy_with_wash_until=t(9,54)), Washer(2, busy_with_wash_until=t(9,57)),
               Washer(3, busy_with_wash_until=t(10,8)), Washer(4, busy_with_wash_until=t(10,12)),
               Washer(5, available=False),                       # maintenance
               Washer(6, busy_with_wash_until=t(10,16))]
    q = [QueuedUnit("1025-1","TOYIN",1), QueuedUnit("1026-1","AMAKA",2), QueuedUnit("1025-2","TOYIN",3),
         QueuedUnit("1027-1","DAVID",4), QueuedUnit("1025-3","TOYIN",5), QueuedUnit("1028-1","CHIOMA",6),
         QueuedUnit("1029-1","KUNLE",7)]
    print(f"\n== {title} ==  (now {f(now)})")
    print(f"{'unit':8}{'who':8}{'washer':8}{'start':10}{'wash end':10}{'dryer':7}{'dry start':10}{'ready':8}")
    for p in project(now, cfg, washers, dryers, q):
        print(f"{p.unit_id:8}{p.customer:8}W{p.washer_id!s:7}{f(p.wash_start):10}{f(p.wash_end):10}D{p.dryer_id!s:6}{f(p.dry_start):10}{f(p.ready_at):8}")
    print("New 2-wash booking now ->", estimate_new_booking(now, cfg, washers, dryers, q, 2))

scenario("5 dryers", [Dryer(i) for i in range(1,6)])
scenario("Only 2 dryers (dryer bottleneck)", [Dryer(1), Dryer(2)])
