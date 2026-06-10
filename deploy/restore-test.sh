#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
TEST_CONTAINER="${TEST_CONTAINER:-math-woods-restore-test}"
TEST_DB="${TEST_DB:-math_woods_test}"

latest="$(ls -t "$BACKUP_DIR"/math_woods_*.dump.gz | sed -n '1p')"

if [ -z "$latest" ]; then
  echo "No backup found in $BACKUP_DIR" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup

echo "Testing restore from $latest"

docker run -d --rm \
  --name "$TEST_CONTAINER" \
  -e POSTGRES_PASSWORD=restore_test \
  -e POSTGRES_DB="$TEST_DB" \
  postgres:16-alpine >/dev/null

i=0
until docker exec "$TEST_CONTAINER" pg_isready -U postgres -d "$TEST_DB" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "Restore test database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

gunzip -c "$latest" | docker exec -i "$TEST_CONTAINER" \
  pg_restore -U postgres -d "$TEST_DB" --no-owner --role=postgres

table_count="$(docker exec "$TEST_CONTAINER" psql -U postgres -d "$TEST_DB" -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public';")"

if [ "$table_count" -le 0 ]; then
  echo "Restore produced no public tables" >&2
  exit 1
fi

echo "Restore test OK: $table_count public tables restored."
