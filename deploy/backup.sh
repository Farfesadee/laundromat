#!/bin/sh
set -eu
cd "$(dirname "$0")"
DATE=$(date +%F)
docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-laundromat}" "${POSTGRES_DB:-laundromat}" \
  | gzip > "laundromat-$DATE.sql.gz"
echo "Backup written: laundromat-$DATE.sql.gz. Copy it off the server and test a restore."
