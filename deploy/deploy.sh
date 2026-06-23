#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.infomaniak.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SYNC_OFFSITE_BACKUPS="${SYNC_OFFSITE_BACKUPS:-0}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

if [ "$SKIP_BACKUP" != "1" ]; then
  sh deploy/backup-postgres.sh

  if [ "$SYNC_OFFSITE_BACKUPS" = "1" ]; then
    SKIP_LOCAL_BACKUP=1 sh deploy/sync-backups-offsite.sh
  fi
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres valkey
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d app uptime-kuma
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate caddy

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T app \
    node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { console.log(r.status, await r.text()); if (!r.ok) process.exit(1); })"; then
    echo "Deploy complete."
    exit 0
  fi

  echo "Health check failed, retrying ($attempt/10)..." >&2
  sleep 2
done

echo "Deploy failed: app health check did not pass." >&2
exit 1
