#!/bin/sh
set -e
DATE=$(date +%F)
docker compose -f deploy/docker-compose.yml exec -T postgres pg_dump -U laundromat laundromat | gzip > "laundromat-$DATE.sql.gz"
echo "Backup written: laundromat-$DATE.sql.gz. Verify with a restore before launch."
