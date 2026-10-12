#!/usr/bin/env bash
# Online backup of the BPHS database, checked and copied out of the container to the host.
# Run it from cron (see RUNBOOK.md, "Backups"). Safe while the app is serving requests.
#
#   CONTAINER   container name                       (default: bphs-assets)
#   DEST        host folder for the copies           (default: /srv/backups/bphs)
#   KEEP_DAYS   delete host copies older than this   (default: 30)
set -euo pipefail
umask 077   # backups hold password hashes and employee data: owner-only

CONTAINER=${CONTAINER:-bphs-assets}
DEST=${DEST:-/srv/backups/bphs}
KEEP_DAYS=${KEEP_DAYS:-30}

mkdir -p "$DEST"
name="bphs-$(date -u +%Y%m%d-%H%M%S).sqlite"
inside="/data/backups/$name"   # the copy in the container's volume
file="$DEST/$name"             # the copy on the host

# Housekeeping: a week of copies stays in the volume, KEEP_DAYS on the host. It runs after a
# failed backup too, so a run of bad nights cannot fill the disk.
prune() {
  docker exec "$CONTAINER" find /data/backups -name 'bphs-*.sqlite*' -mtime +7 -delete || true
  find "$DEST" -name 'bphs-*.sqlite*' -mtime +"$KEEP_DAYS" -delete || true
}

# 1. Take the backup inside the container (SQLite backup API), under a name chosen here, so
#    the file checked and copied below is this run's and not whichever happens to be newest.
docker exec "$CONTAINER" node server/backup.ts "$inside" > /dev/null

# 2. Refuse to ship a damaged copy, and do not leave it in the volume looking like a backup.
docker exec "$CONTAINER" node -e "
  const db = new (require('better-sqlite3'))(process.argv[1], { readonly: true })
  process.exit(db.pragma('integrity_check', { simple: true }) === 'ok' ? 0 : 1)" "$inside" \
  || { echo "integrity_check failed for $inside; removed it" >&2; docker exec "$CONTAINER" rm -f "$inside" || true; prune; exit 1; }

# 3. Stream it to the host. Streaming avoids bind-mount permission problems, and the
#    .partial name means a half-written file is never mistaken for a backup.
docker exec "$CONTAINER" cat "$inside" > "$file.partial"
[ -s "$file.partial" ] || { echo "copied backup is empty" >&2; rm -f "$file.partial"; prune; exit 1; }
mv "$file.partial" "$file"

prune

echo "backup ok: $file ($(stat -c %s "$file") bytes)"
