#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
SKIP_LOCAL_BACKUP="${SKIP_LOCAL_BACKUP:-0}"

if [ "$SKIP_LOCAL_BACKUP" != "1" ]; then
  sh deploy/backup-postgres.sh
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Missing backup directory: $BACKUP_DIR" >&2
  exit 1
fi

if [ -n "${OFFSITE_BACKUP_TARGET:-}" ]; then
  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync is required for OFFSITE_BACKUP_TARGET." >&2
    exit 1
  fi

  target="${OFFSITE_BACKUP_TARGET%/}/"
  rsync -az --delete "$BACKUP_DIR"/ "$target"
  echo "Synced backups to $target"
  exit 0
fi

if [ -n "${OFFSITE_BACKUP_RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "rclone is required for OFFSITE_BACKUP_RCLONE_REMOTE." >&2
    exit 1
  fi

  rclone sync "$BACKUP_DIR" "$OFFSITE_BACKUP_RCLONE_REMOTE"
  echo "Synced backups to $OFFSITE_BACKUP_RCLONE_REMOTE"
  exit 0
fi

echo "No offsite backup destination configured." >&2
echo "Set OFFSITE_BACKUP_TARGET=user@host:/path or OFFSITE_BACKUP_RCLONE_REMOTE=remote:path." >&2
exit 1
