# LAUNDROMAT

**Wash · Dry · Relax**: a web-based CRM, live queue, POS and operations system for a self-service laundromat.

LAUNDROMAT mirrors the physical store in real time. Customers join *today's* queue (no appointments), staff run washers and dryers from a tablet, the in-store TV shows who is up next, and the owner sees expected vs actual money at any moment.

> **Core principle:** if a machine is busy in the store, it is busy in the CRM. The CRM is the single source of truth for customers, queue, machines, sales, payments and daily operations.

---

## Table of contents

- [Features](#features)
- [MVP scope](#mvp-scope)
- [Architecture at a glance](#architecture-at-a-glance)
- [Tech stack](#tech-stack)
- [How the queue works](#how-the-queue-works)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API](#api)
- [User roles](#user-roles)
- [Deployment](#deployment)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

---

## Features

### Customer (mobile browser, website, QR code)
- Register online (or be registered in store; same profile either way)
- **Preferred name** ("What would you like us to call you in-store?"), used by staff and on the TV
- Book *N* washes (each wash = 10 kg standard load) for **today only**
- See the live estimated wait before paying
- Pay online with **Paystack** (card, transfer, other methods). Online bookings are confirmed only after verified payment.
- Add drinks/coffee, or place a **drop-off** order
- Live per-wash tracking: queue position, washer, wash time left, dryer, dry time left, rework, estimated completion, collection status
- Notifications: booking confirmed, approaching turn, turn available, grace running, skipped, washing, drying, ready, machine interruption
- Clear reminder everywhere: *Arrive at least 10 minutes before your estimated turn.*

### Staff (CRM, tablet-friendly)
- Register/search customers, create in-store bookings, check customers in
- Live store dashboard: washers, dryers, waiting washes, ready orders, estimated wait, drop-off status
- Queue management and **10-minute grace period** with skip action
- Washer/dryer actions: start, complete, pause, rewash, rerinse, redry, mark unavailable/available
- **Machine failure → restart/recalibrate** with manager PIN, customer ETA updates automatically
- Toggle **Accepting bookings** and **Drop-off ON/OFF**
- POS: services, drinks, coffee, discounts, payment method (cash, transfer, POS/card, Paystack…)

### Owner / Manager
- Sales dashboard (daily/weekly/monthly, by service, by payment method)
- **Expected vs actual money**, variance flags, payment reconciliation
- Customer CRM: visits, spend, average order, segments
- Operations: wash volume, waits, washer/dryer utilisation, rework rates, downtime, no-show rate
- **Close Day** with immutable daily report
- Full staff **audit trail**

### Store TV
- **Now Serving** and **Coming Up**, with mandatory timestamps (`10:12 AM · TOYIN · WASHER 5`)
- Preferred names only. No phone numbers or sensitive data.

---

## MVP scope

| Area | Included |
|---|---|
| Customer | Registration (online + in-store), preferred name, login, number of washes, online payment, live queue, live progress, notifications |
| Staff | Customer registration, in-store booking, check-in, queue/washer/dryer management, 10-min grace, machine failure/recalibration, rewash/rerinse/redry, drop-off capacity, payment entry |
| Owner | Sales dashboard, expected vs actual, reconciliation, customer CRM, daily reports, machine utilisation, queue analytics, staff audit trail |
| Store | Live TV queue: Now Serving, timestamp, Coming Up |

**Not in MVP:** WhatsApp automation, loyalty, memberships, referrals, automated marketing, reviews, pickup/delivery, multi-branch management, native mobile app, saved payment methods, wallet, subscriptions.

**Definition of done:** a customer can *register → book 3 washes → pay online or book in store → join today's queue → see live wait → get the 10-minute reminder → arrive & check in → see washer → wash → dryer → see live progress → complete → collect*, while the business sees *customer → order → washes → machines → payment → sales → expected money → actual money → reporting* in one system.

---

## Architecture at a glance

```mermaid
flowchart LR
  C[Customer web] & S[Staff CRM] & O[Owner dashboard] & TV[Store TV] --> FE[Next.js + Tailwind]
  FE --> API[FastAPI REST + WebSocket]
  N[Future native app] -.-> API
  API <--> PG[(PostgreSQL)]
  API <--> R[(Redis)]
  W[Worker] <--> PG
  W <--> R
  API <--> PS[Paystack]
  W --> SMS[SMS / Email]
```

Modular monolith, API-first, realtime via WebSockets (Redis pub/sub), background worker for timers and notifications. Full details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| Worker | ARQ (Redis) |
| Database | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Frontend | Next.js (App Router), React, TailwindCSS, TanStack Query |
| Payments | Paystack |
| Notifications | SMS/Email provider adapter (WhatsApp later) |
| Hosting | Namecheap domain + **Namecheap VPS** with Docker Compose and Caddy |

> Namecheap *shared* hosting can't run FastAPI + WebSockets + Redis + a worker. Use a VPS.

---

## How the queue works

The queue engine is the most important component. It is a **pure function** that takes a snapshot of machines and the ordered list of *wash units* and returns the projected washer, start time, dryer and ready time for every unit.

- Counts **wash units and machine capacity**, not customers
- Accounts for washer/dryer availability, remaining time, downtime, rework, restarts, no-shows and drop-off capacity
- One customer's washes are interleaved with others' (Toyin → W1, Amaka → W2, Toyin → W3 …)
- Recalculated on every relevant event (booking, check-in, machine start/finish, failure, skip, rework, restart, drop-off change)

Example (now 9:43 AM, 35 min wash, 20 min dry, W5 in maintenance):

| Unit | Customer | Washer | Start | Ready |
|---|---|---|---|---|
| 1025-1 | TOYIN | W1 | 9:54 AM | 10:49 AM |
| 1026-1 | AMAKA | W2 | 9:57 AM | 10:52 AM |
| 1025-2 | TOYIN | W3 | 10:08 AM | 11:03 AM |
| 1027-1 | DAVID | W4 | 10:12 AM | 11:07 AM |
| 1025-3 | TOYIN | W6 | 10:16 AM | 11:11 AM |

Run the prototype yourself:

```bash
cd backend/app/queue
python3 demo.py
```

Full algorithm, grace-period handling, drop-off modes and test strategy: [`docs/ARCHITECTURE.md#5`](docs/ARCHITECTURE.md#5-the-queue-engine-most-critical-component).

---

## Repository layout

Target structure (the queue engine prototype already exists):

```text
laundromat/
├── README.md
├── docs/
│   └── ARCHITECTURE.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/            # config, security, db, redis, logging
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── customers/
│   │   │   ├── orders/
│   │   │   ├── washes/      # wash units, grace, skip, rework, restart
│   │   │   ├── machines/
│   │   │   ├── dropoff/
│   │   │   ├── payments/    # POS + Paystack + webhooks
│   │   │   ├── reports/     # reconciliation, analytics, daily close
│   │   │   ├── notifications/
│   │   │   ├── audit/
│   │   │   └── settings/
│   │   ├── queue/
│   │   │   ├── engine.py    # pure projection function  [done] prototype
│   │   │   ├── demo.py      # scenario demo             [done] prototype
│   │   │   └── service.py   # recompute(): snapshot → project → persist → publish
│   │   ├── realtime/        # WebSocket gateway, Redis pub/sub
│   │   └── workers/         # grace timers, notifications, nightly jobs
│   ├── migrations/          # Alembic
│   ├── tests/
│   └── pyproject.toml
├── web/                     # Next.js app: (customer) (staff) (owner) (tv)
│   ├── app/
│   ├── components/
│   └── lib/api/             # generated OpenAPI client
├── deploy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── backup.sh
└── .github/workflows/
```

---

## Getting started

### Prerequisites
- Python 3.12+
- Node.js 20+
- Docker + Docker Compose (recommended for Postgres/Redis)
- A Paystack account (test keys for development)

### 1. Clone and configure

```bash
git clone <repo-url> laundromat && cd laundromat
cp backend/.env.example backend/.env
cp web/.env.example web/.env.local
```

### 2. Start dependencies

```bash
docker compose -f deploy/docker-compose.dev.yml up -d postgres redis
```

### 3. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
python -m app.scripts.seed        # store, machines, services, demo users
uvicorn app.main:app --reload --port 8000
```

In a second terminal, run the worker:

```bash
arq app.workers.WorkerSettings
```

API docs: http://localhost:8000/docs

### 4. Frontend

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. Pages: customer `/`, staff `/staff`, owner `/owner`, TV `/tv`.

### 5. Paystack webhooks locally

```bash
# expose the API and set the URL in the Paystack dashboard (test mode)
ngrok http 8000
# webhook URL: https://<id>.ngrok.app/api/v1/webhooks/paystack
```

---

## Configuration

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `APP_ENV` | `local` / `staging` / `production` |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@localhost:5432/laundromat` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `JWT_SECRET` | Long random string |
| `JWT_ACCESS_MINUTES` | Default `15` |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` / `sk_live_...` (server only) |
| `PAYSTACK_CALLBACK_URL` | Customer return URL after payment |
| `SMS_PROVIDER` / `SMS_API_KEY` | Notification provider |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` | Email provider |
| `STORE_TIMEZONE` | `Africa/Lagos` |
| `CORS_ORIGINS` | Allowed web origins |

### Frontend (`web/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | e.g. `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_WS_URL` | e.g. `ws://localhost:8000/ws` |

### Admin-configurable settings (stored in DB, editable by owner)

Opening time · queue open/close time (defaults 8:00 AM / 7:30 PM) · wash duration · dry duration · grace period (10 min) · rework allowance (20 min) · max acceptable wait · number of washers/dryers · drop-off capacity and mode · pricing and services · payment methods · notification settings · staff accounts and permissions.

---

## API

- Base path: `/api/v1` · JSON · OpenAPI at `/docs`
- Auth: `Authorization: Bearer <jwt>`. Token-based so a native app can reuse it as-is.
- Realtime: `WS /ws`, with channels for staff, TV and per-customer updates.

| Area | Examples |
|---|---|
| Auth | `POST /auth/login`, `/auth/otp/verify`, `/auth/refresh` |
| Queue | `GET /queue/estimate?washes=3`, `GET /queue/public` |
| Orders | `POST /orders`, `POST /orders/{id}/check-in` |
| Wash units | `POST /wash-units/{id}/start`, `/skip`, `/rework`, `/restart` |
| Machines | `PATCH /machines/{id}` |
| Payments | `POST /orders/{id}/payments`, `POST /webhooks/paystack` |
| Reports | `GET /reports/reconciliation`, `POST /days/{date}/close` |

Full endpoint list: [`docs/ARCHITECTURE.md#10`](docs/ARCHITECTURE.md#10-api-design).

---

## User roles

| Role | Highlights |
|---|---|
| **Customer** | Register, book, pay, track own washes |
| **CRM Staff** | Register customers, book, check in, run queue and machines, record payments, drop-off capacity |
| **Manager** | Staff + reports, reconciliation, machine settings, staff management, **authorise restart**, **close day** |
| **Owner/Admin** | Everything, including pricing and system settings |

Sensitive actions (restart, refund, close day) require a manager PIN and are written to the append-only audit log.

---

## Deployment

The production host runs LAUNDROMAT beside existing applications, with its
own Docker project, private Postgres volume, loopback ports, and nginx
server blocks. See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for the full
checklist.

Summary:

1. Point `laundromat.accredit.vip` and `api.laundromat.accredit.vip` (A
   records) at the VPS.
2. Copy the repository to `/opt/laundromat` and fill
   `deploy/.env.production.example` into `deploy/.env`.
3. Build and start the isolated stack:

```bash
cd /opt/laundromat/deploy
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
docker compose --env-file .env -f docker-compose.prod.yml run --rm api python -m app.scripts.seed
docker compose --env-file .env -f docker-compose.prod.yml run --rm api python -m app.scripts.create_owner
```

4. Obtain a certificate with certbot and install
   `deploy/nginx/laundromat.tls.conf`.
5. Set the Paystack webhook to
   `https://api.laundromat.accredit.vip/api/v1/webhooks/paystack`.
6. Schedule and test a `pg_dump` backup, then open `/tv?token=<device-token>`
   in Chrome kiosk mode on the store TV.

CI/CD via GitHub Actions: lint, test, build, deploy.

---

## Testing

```bash
# backend
cd backend && pytest

# queue engine prototype
python3 backend/app/queue/demo.py

# frontend
cd web && npm run lint && npm test

# end-to-end (Definition of Done journey)
npx playwright test
```

Highest-priority coverage: the **queue engine** (golden scenarios + property tests), **Paystack webhook** handling (signature, replay, amount mismatch), role permissions, and expected-vs-actual reconciliation.

---

## Roadmap

1. **Phase 0:** queue engine proof (prototype [done]), Paystack sandbox spike
2. **Phase 1:** foundation, auth, roles, customers, settings
3. **Phase 2:** machines, production queue engine, staff booking/check-in, grace/skip, TV
4. **Phase 3:** online booking + Paystack, POS, reconciliation, daily close
5. **Phase 4:** failure/restart, rework, drop-off, notifications, owner reports, audit views
6. **Phase 5:** hardening, simulated-day load test, training, soft launch

**Later:** WhatsApp automation, loyalty, memberships, referrals, marketing automation, reviews, pickup/delivery, multi-branch, native app, saved payment methods, wallet, subscriptions. The data model already carries `store_id` and the API is versioned and token-based to make these additive.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system design, data model, queue engine, flows, security, API, deployment
- `backend/app/queue/engine.py`: queue engine reference implementation
- `backend/app/queue/demo.py`: runnable demonstration of the Toyin example

---

## License

Proprietary. © LAUNDROMAT. All rights reserved.
