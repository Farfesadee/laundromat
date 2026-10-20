# Deployment

This deployment runs LAUNDROMAT beside existing applications on the same
VPS. It never edits or restarts another project.

## Placement

| Item | Value |
|---|---|
| Host | `203.161.60.171` |
| App directory | `/opt/laundromat` |
| Compose project | `laundromat` |
| Web (loopback only) | `127.0.0.1:3100` |
| API (loopback only) | `127.0.0.1:8100` |
| Database | Postgres 16 container, private Docker network |
| Reverse proxy | New nginx site `laundromat.conf` only |
| Public names | `laundromat.accredit.vip`, `api.laundromat.accredit.vip` |

Existing nginx sites, uvicorn services, PostgreSQL clusters, and the
Evolution API Docker stack are not modified.

## DNS records

Add these in Namecheap, Advanced DNS, for `accredit.vip`:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `laundromat` | `203.161.60.171` | Automatic |
| A | `api.laundromat` | `203.161.60.171` | Automatic |

Do not use `@` or `www`; those already belong to the existing site.

Verify from any machine:

```bash
dig +short laundromat.accredit.vip
dig +short api.laundromat.accredit.vip
```

Both must return `203.161.60.171` before requesting the certificate.

## First install

```bash
cd /opt/laundromat/deploy
cp .env.production.example .env
chmod 600 .env
# Fill POSTGRES_PASSWORD, JWT_SECRET, and the OWNER_* values.
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
docker compose --env-file .env -f docker-compose.prod.yml run --rm api python -m app.scripts.seed
docker compose --env-file .env -f docker-compose.prod.yml run --rm api python -m app.scripts.create_owner
```

`create_owner` is the bootstrap path because `/api/v1/users` itself
requires an owner. It reads `OWNER_EMAIL`, `OWNER_PASSWORD`, and
`OWNER_PIN` from the environment.

Production seeding creates machines, services, today's operating day,
and settings. It never creates demo users.

## TLS

Keep the pre-TLS nginx file until the certificate exists:

```bash
install -m 644 deploy/nginx/laundromat.conf /etc/nginx/sites-available/laundromat.conf
ln -sfn /etc/nginx/sites-available/laundromat.conf /etc/nginx/sites-enabled/laundromat.conf
mkdir -p /var/www/html
nginx -t && systemctl reload nginx
```

Once both DNS names resolve:

```bash
certbot certonly --webroot -w /var/www/html \
  -d laundromat.accredit.vip -d api.laundromat.accredit.vip \
  --cert-name laundromat.accredit.vip --non-interactive --agree-tos

install -m 644 deploy/nginx/laundromat.tls.conf /etc/nginx/sites-available/laundromat.conf
nginx -t && systemctl reload nginx
```

The certificate is renewed by the existing certbot timer. Verify with:

```bash
curl -sS https://api.laundromat.accredit.vip/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://laundromat.accredit.vip/
```

The web server returns 404 for `/_next/image`. The site serves plain `<img>`
assets, so the Next image optimizer endpoint is not needed and closing it
removes that attack surface. If you adopt `next/image` later, upgrade Next.js
to a release with the optimizer fixes before removing this block.

## Paystack

Set in `/opt/laundromat/deploy/.env`:

```text
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_CALLBACK_URL=https://laundromat.accredit.vip/checkout/callback
```

Then restart the API:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d api
```

In the Paystack dashboard set the webhook to:

```text
https://api.laundromat.accredit.vip/api/v1/webhooks/paystack
```

Subscribe to `charge.success`. Card checkout stays hidden while the key is
`unconfigured`; pay-in-store still works, and no fake checkout URL is
produced.

## Customer accounts

Customers sign in with their email address and password. The sign in page
also shows a Google button when Google OAuth is configured, and a phone code
option only when `SMS_ENABLED=true`.

Registration collects first name, last name, email address, phone number, and
password. Phone numbers are stored in E.164 form. The phone field groups the
country selector with the number and shows the country flag from bundled SVG
assets, so the same form works for customers outside Nigeria.

`NEXT_PUBLIC_DEFAULT_COUNTRY` sets the initial country (ISO 3166-1 alpha-2,
default `NG`). It is compiled into the web bundle, so rebuild the web image
after changing it.

For an existing database, run the idempotent migration before the new API
starts handling requests:

```bash
cd /opt/laundromat/deploy
docker compose --env-file .env -f docker-compose.prod.yml build api
docker compose --env-file .env -f docker-compose.prod.yml run --rm api \
  python -m app.scripts.migrate_customer_auth
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

It adds `customers.password_hash`, `customers.google_sub`, the unique Google
subject index, and the `login_codes` table. It is safe to run more than once.

## Google sign in

Create a Google Cloud project and configure an OAuth consent screen:

1. Add the app name, support email, and authorized domain `accredit.vip`.
2. Add the scopes `openid`, `email`, and `profile`.
3. Create an OAuth client ID of type **Web application**.
4. Add this exact Authorized redirect URI:

```text
https://api.laundromat.accredit.vip/api/v1/auth/google/callback
```

5. Add `https://laundromat.accredit.vip` as an Authorized JavaScript origin.

Put the credentials in `/opt/laundromat/deploy/.env`:

```text
FRONTEND_URL=https://laundromat.accredit.vip
PUBLIC_API_URL=https://api.laundromat.accredit.vip/api/v1
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.laundromat.accredit.vip/api/v1/auth/google/callback
```

`GOOGLE_REDIRECT_URI` is optional when `PUBLIC_API_URL` is already correct.
Restart the API after changing it:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d api
```

The sign in and create account pages read `/api/v1/auth/providers` at
runtime. The Google button appears on both pages only when both client values
are set, so no web rebuild is needed after adding credentials. Test the full
flow in a private window and confirm the browser returns to
`/auth/google/callback#code=...` before landing on `/book`.

## Phone code sign in

`SMS_ENABLED=false` by default. While it is false, the phone code option stays
hidden and no customer is invited into a flow that cannot deliver a code.
Set it to `true` only after an SMS provider adapter is wired and tested.

## Operations

```bash
cd /opt/laundromat/deploy
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs -f api
docker compose --env-file .env -f docker-compose.prod.yml logs -f web
docker compose --env-file .env -f docker-compose.prod.yml restart api
```

Health checks:

```bash
curl -sS http://127.0.0.1:8100/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/
```

Backups:

```bash
cd /opt/laundromat
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  pg_dump -U laundromat laundromat | gzip > laundromat-$(date +%F).sql.gz
```

Copy backups off the server and test a restore before launch.

## Update procedure

```bash
cd /opt/laundromat
git pull
cd deploy
docker compose --env-file .env -f docker-compose.prod.yml build
docker compose --env-file .env -f docker-compose.prod.yml run --rm api \
  python -m app.scripts.migrate_customer_auth
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

The database volume is named `laundromat_pg_data`; rebuilding containers
does not delete it. The migration is idempotent, so it belongs in every
update even when no schema change is expected.

## Before real customers

1. Replace the bootstrap owner password with your own.
2. Set real service prices and machine counts in the owner screens.
3. Set `PAYSTACK_SECRET_KEY` and test one live or test-mode payment.
4. Provision the TV device token as a manager and open `/tv?token=...`.
5. Add Google OAuth credentials and test one sign in with a real Google account.
6. Connect an SMS provider before setting `SMS_ENABLED=true`.
7. Configure the SMS and email sender adapters. Until then, notifications
   are stored in-app only.
8. Schedule and test a database backup.
