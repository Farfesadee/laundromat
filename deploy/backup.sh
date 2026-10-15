#!/bin/sh
set -e
DATE=$(date +%F)
docker compose -f deploy/docker-compose.yml exec -T postgres pg_dump -U spinease spinease | gzip > "spinease-$DATE.sql.gz"
echo "Backup written: spinease-$DATE.sql.gz -- verify with a restore before launch."
