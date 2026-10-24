---
description: Take, schedule, check and restore BPHS-Connect database backups, including the off-box copy to Google Drive and the quarterly restore drill
scope: root
covers: [backup, restore, sqlite, backup-offbox, cron, rclone, google-drive, off-box, scratch-volume, drill, sessions, disaster-recovery, monitoring]
---

# Back up and restore

Everything the system holds is in `/data/bphs.sqlite`. The full procedures, with every command, are in [RUNBOOK.md sections 4 and 5](../RUNBOOK.md#4-backups). The VPS's Google Drive remote is in [DEPLOY-GUIDE.md step 12](../DEPLOY-GUIDE.md#12-schedule-backups-and-copy-them-off-the-vps).

## Take a backup

1. One-off, kept in the volume only: `docker compose exec assets node server/backup.ts`. On a development checkout, run `bun run db:backup` instead.
2. Checked and copied off the box: `DEST=/srv/backups/bphs ./scripts/backup-offbox.sh`. Add `REMOTE=bphs-backup:` to upload it too. `CONTAINER`, `KEEP_DAYS` and `REMOTE_KEEP_DAYS` are listed in RUNBOOK 4.2. A successful run ends with `backup ok: <file>`, or `uploaded:` when uploading.
3. Treat every copy as HR files. Copies hold password hashes, grievances, reviews and attachments.

## Keep it working

1. Production runs it every night from `/etc/cron.d/bphs-connect-backup` (as root, `REMOTE=bphs-backup:`).
2. Alert on a stale backup and on a failed upload. The two checks are in RUNBOOK 4.2, "Know when it stops working".
3. Watch the disk: `du -sh /srv/backups/bphs`.
4. Every quarter, restore the newest copy into a scratch volume and check it (RUNBOOK 5.3).

## Restore

1. Tell people that everything since the backup will be lost.
2. Into the live system, follow RUNBOOK 5.1 in order:
   1. Stop the app.
   2. Move the current database aside.
   3. Stream the backup in through stdin.
   4. Delete all sessions.
   5. Start the app, check `/api/health` and `server/admin.ts list`, then check the screens.
3. On the production VPS, put `sudo docker compose -f /etc/bphs-connect/compose.yml` in place of `docker compose`.
4. If the container won't start after a restore, check the log for a SQLite error and restore a different file (RUNBOOK 5.2).
5. To inspect old data without touching the live system, restore into a scratch volume (RUNBOOK 5.3).
6. Accounts whose passwords changed after the backup need a reset (`how-tos/recover-locked-account.md`).
7. Once you are sure, delete the `/data/pre-restore-<timestamp>/` folder.
