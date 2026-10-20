"""LAUNDROMAT API: modular monolith. Versioned at /api/v1, docs at /docs."""
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db

BRAND = "LAUNDROMAT"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # grace-period scheduler (APScheduler thread locally; ARQ/Redis in prod)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from app.workers.jobs import check_grace_periods
        sched = BackgroundScheduler(daemon=True)
        sched.add_job(check_grace_periods, "interval", seconds=60, id="grace")
        sched.start()
        app.state.sched = sched
    except Exception:
        pass
    yield

app = FastAPI(title=f"{BRAND} API", version="1.0.0", lifespan=lifespan)
# Strict CORS: exact origins only. Credentialed requests require explicit origins,
# so the wildcard is never appended (it would break allow_credentials anyway).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    max_age=600,
)

@app.get("/healthz")
def healthz():
    return {"ok": True, "env": settings.APP_ENV, "brand": BRAND}

from app.modules.auth.router import router as auth_r
from app.modules.customers.router import customers as customers_r, catalogue as catalogue_r, store as store_r
from app.modules.orders.router import orders as orders_r, queue as queue_r, washes as washes_r, machines as machines_r, dropoff as dropoff_r
from app.modules.payments.router import router as payments_r
from app.modules.reports.router import router as reports_r, days as days_r
from app.modules.audit.router import router as admin_r
from app.modules.admin.router import router as super_admin_r
from app.modules.devices.router import router as devices_r
from app.realtime.gateway import router as ws_r

for r in (auth_r, customers_r, catalogue_r, store_r, queue_r, orders_r, washes_r, machines_r, dropoff_r, payments_r, reports_r, days_r, admin_r, super_admin_r, devices_r):
    app.include_router(r, prefix="/api/v1")
app.include_router(ws_r)  # WS /ws (unversioned, as documented)
