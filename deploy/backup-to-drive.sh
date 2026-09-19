#!/bin/bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${RCLONE_CONFIG_GDRIVE_CLIENT_ID:?RCLONE_CONFIG_GDRIVE_CLIENT_ID must be set}"
: "${RCLONE_CONFIG_GDRIVE_CLIENT_SECRET:?RCLONE_CONFIG_GDRIVE_CLIENT_SECRET must be set}"
: "${RCLONE_CONFIG_GDRIVE_TOKEN:?RCLONE_CONFIG_GDRIVE_TOKEN must be set}"

BACKUP_DIR=${BACKUP_DIR:-/var/backups/vape-shop}
REMOTE_DIR=${REMOTE_DIR:-gdrive:vape-shop-backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-86400}

export RCLONE_CONFIG_GDRIVE_TYPE=drive
export RCLONE_CONFIG_GDRIVE_SCOPE=drive.file

mkdir -p "$BACKUP_DIR"
umask 077

backup_once() {
  local stamp file checksum
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file="$BACKUP_DIR/database-$stamp.dump"
  checksum="$file.sha256"

  echo "[$(date -u +%FT%TZ)] Starting PostgreSQL backup"
  pg_dump --format=custom --compress=9 --no-owner --no-acl \
    --file "$file" "$DATABASE_URL"
  pg_restore --list "$file" >/dev/null
  sha256sum "$file" > "$checksum"

  rclone copyto "$file" "$REMOTE_DIR/$(basename "$file")" --checkers 2 --transfers 1
  rclone copyto "$checksum" "$REMOTE_DIR/$(basename "$checksum")" --checkers 2 --transfers 1
  rclone check "$BACKUP_DIR" "$REMOTE_DIR" \
    --include "$(basename "$file")" \
    --include "$(basename "$checksum")" \
    --one-way

  # Retention applies only to backup files created by this OAuth application.
  rclone delete "$REMOTE_DIR" --min-age "${RETENTION_DAYS}d" \
    --include 'database-*.dump' \
    --include 'database-*.dump.sha256'
  find "$BACKUP_DIR" -type f -name 'database-*.dump*' -mtime +2 -delete

  touch /tmp/last-backup-success
  echo "[$(date -u +%FT%TZ)] Backup uploaded and verified"
}

while true; do
  if ! backup_once; then
    echo "[$(date -u +%FT%TZ)] Backup failed; retrying in one hour" >&2
    sleep 3600
    continue
  fi
  sleep "$INTERVAL_SECONDS"
done
