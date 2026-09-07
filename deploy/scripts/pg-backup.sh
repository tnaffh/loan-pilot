#!/usr/bin/env bash
# Dump the loanpilot database, keep a short local history, and push it off-box.
#
# Used two ways:
#   nightly cron          -> deploy/scripts/pg-backup.sh nightly
#   before every rollout  -> deploy/scripts/pg-backup.sh pre-deploy
#
# This is the loan book's only backup. Cloud SQL was running with
# backupConfiguration.enabled=false, so nothing was being backed up before this either.
# A DigitalOcean droplet snapshot is NOT a substitute: restoring one rolls back 19
# unrelated domains, MariaDB and Plesk along with us.
#
# Auth comes from ~/.pgpass (chmod 600), not from DATABASE_URL — that URL carries
# Prisma-only query params (connection_limit, pool_timeout, schema) which libpq rejects
# outright, so pg_dump cannot be handed it.
#
# Off-box copy uses the rclone remote configured for the migration. Set BACKUP_REMOTE=''
# to skip it (local-only), though that leaves the only copy on the machine most likely
# to be the thing that failed.

set -euo pipefail

LABEL="${1:-manual}"
BACKUP_DIR="${BACKUP_DIR:-/root/loanpilot-backups}"
BACKUP_REMOTE="${BACKUP_REMOTE-spaces:raccoonsfinance-loanpilot-backups}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"

export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGUSER="${PGUSER:-loanpilot}"
export PGDATABASE="${PGDATABASE:-loanpilot}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/loanpilot-$LABEL-$STAMP.dump"

pg_dump -Fc -f "$OUT"
chmod 600 "$OUT"

# A pg_dump that exits 0 but writes a truncated file is the failure mode that matters,
# because you only discover it during a restore. Read the archive's table of contents
# back to prove it is well-formed.
pg_restore --list "$OUT" > /dev/null
echo "dump ok: $OUT ($(du -h "$OUT" | cut -f1))"

if [ -n "$BACKUP_REMOTE" ]; then
  rclone copyto "$OUT" "$BACKUP_REMOTE/$(basename "$OUT")"
  echo "uploaded: $BACKUP_REMOTE/$(basename "$OUT")"
fi

# Local history is a convenience for fast rollback; the remote copy is the real backup.
find "$BACKUP_DIR" -name 'loanpilot-*.dump' -mtime "+$KEEP_LOCAL_DAYS" -delete
