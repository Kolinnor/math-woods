#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.infomaniak.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: sh deploy/restore-postgres.sh backups/postgres/math_woods_YYYYMMDDTHHMMSSZ.dump.gz" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Missing backup file: $BACKUP_FILE" >&2
  exit 1
fi

echo "This will replace the current Postgres database from $BACKUP_FILE."
echo "Press Ctrl+C now to abort, or wait 10 seconds to continue."
sleep 10

gzip -dc "$BACKUP_FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner'

echo "Restore complete."
