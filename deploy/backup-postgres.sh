#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

BACKUP_DIR=${BACKUP_DIR:-/var/backups/vape-shop}
RETENTION_DAYS=${RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
umask 077
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  --file "$BACKUP_DIR/database-$STAMP.dump"

find "$BACKUP_DIR" -type f -name 'database-*.dump' -mtime "+$RETENTION_DAYS" -delete

