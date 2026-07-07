#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-.env.production}"
APP_URL="${APP_URL:-https://mathwoods.org}"

if [ -f "$ENV_FILE" ]; then
  set -a
  case "$ENV_FILE" in
    /*) . "$ENV_FILE" ;;
    *) . "./$ENV_FILE" ;;
  esac
  set +a
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "Missing CRON_SECRET." >&2
  exit 1
fi

curl -fsS \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/contribution-request-reminders"
