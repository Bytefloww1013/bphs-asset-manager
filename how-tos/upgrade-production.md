---
description: Upgrade the production VPS to a new version — record, back up, build, rehearse the migration, switch over, check, and go back if it fails
scope: root
covers: [deploy, upgrade, update, production, vps, docker, compose, backup, migration, rehearse, migration-check, rollback, previous-image, health-check]
---

# Upgrade production

The commands are in two places and must not be copied here. On the production VPS (Compose file `/etc/bphs-connect/compose.yml`, run with `sudo`), follow [DEPLOY-GUIDE.md step 13](../DEPLOY-GUIDE.md#13-deploy-later-updates). On a host using a plain `docker-compose.yml`, follow [RUNBOOK.md section 7](../RUNBOOK.md#7-upgrading).

1. Before you start, make sure the release is merged to `main` and its CI is green. Read the release notes in `RUNBOOK.md` section 7 for every migration it adds.
2. Note the running commit (`git rev-parse HEAD`). You need it to go back.
3. Take a backup with `scripts/backup-offbox.sh` (on the VPS, `CONTAINER=bphs-assets` and `sudo env`) (see `how-tos/backup-and-restore.md`). Note the file name from its last line, `backup ok: …`. Stop if the script fails.
4. Pull, tag the running image `previous`, and build the new image. The old version keeps serving while it builds.
5. If the release adds a migration, rehearse it on the backup before anything touches the live database: for 0024, with `docs/verify/migration-check.mjs` (RUNBOOK 7.1); for later migrations, in a scratch volume (RUNBOOK 5.3). On any `FAIL`, stop. Nothing has changed yet.
6. Switch over (`up -d`; on the VPS, `up -d --wait --wait-timeout 120`). Then check:
   - The log shows `BPHS-Connect listening on :3000` with no errors.
   - `/api/health` answers `{"ok":true}`.
   - Signed in, each workspace, both asset lists, an employee who holds something, and the Audit log show the data as it was before.
7. If the new container won't start:
   1. Save its log first.
   2. A `DrizzleError` from `runMigrations` means the migration rolled back: go back to the old commit and the `previous` image, with no restore needed (RUNBOOK 7.2).
   3. Any other failure after the migrations ran: roll back together with the pre-upgrade backup (RUNBOOK 7.3). Use `up -d --force-recreate`, never `start`.
8. Clean up afterwards: `docker image prune`. Once the new version has run well for a while, remove the `previous` image.

Never use `docker compose down -v`, and never remove or prune the data volume during an upgrade.
