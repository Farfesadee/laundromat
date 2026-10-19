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
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

The database volume is named `laundromat_pg_data`; rebuilding containers
does not delete it.

## Before real customers

1. Replace the bootstrap owner password with your own.
2. Set real service prices and machine counts in the owner screens.
3. Set `PAYSTACK_SECRET_KEY` and test one live or test-mode payment.
4. Provision the TV device token as a manager and open `/tv?token=...`.
5. Configure the SMS and email sender adapters. Until then, notifications
   are stored in-app only.
6. Schedule and test a database backup.
