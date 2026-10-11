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
file="$DEST/bphs-$(date -u +%Y%m%d-%H%M%S).sqlite"

# 1. Take the backup inside the container (SQLite backup API) and find the file it wrote.
docker exec "$CONTAINER" node server/backup.ts > /dev/null
latest=$(docker exec "$CONTAINER" sh -c 'ls -t /data/backups/bphs-*.sqlite | head -1')

# 2. Refuse to ship a damaged copy.
docker exec "$CONTAINER" node -e "
  const db = new (require('better-sqlite3'))(process.argv[1], { readonly: true })
  process.exit(db.pragma('integrity_check', { simple: true }) === 'ok' ? 0 : 1)" "$latest" \
  || { echo "integrity_check failed for $latest" >&2; exit 1; }

# 3. Stream it to the host. Streaming avoids bind-mount permission problems, and the
#    .partial name means a half-written file is never mistaken for a backup.
docker exec "$CONTAINER" cat "$latest" > "$file.partial"
[ -s "$file.partial" ] || { echo "copied backup is empty" >&2; rm -f "$file.partial"; exit 1; }
mv "$file.partial" "$file"

# 4. Housekeeping: a week of copies stays in the volume, KEEP_DAYS on the host.
docker exec "$CONTAINER" find /data/backups -name 'bphs-*.sqlite*' -mtime +7 -delete
find "$DEST" -name 'bphs-*.sqlite*' -mtime +"$KEEP_DAYS" -delete

echo "backup ok: $file ($(stat -c %s "$file") bytes)"
