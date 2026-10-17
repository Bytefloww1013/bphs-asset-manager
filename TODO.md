# TODO

Things still to handle for BPHS-Connect. Tick an item off when it is done, and add new ones as they come up.

## Production (https://bphs-connect.com)

- [x] **Change the first Super Admin's password, urgently.** Sign in as `admin@bphs-connect.com` with the starting password from [DEPLOY-GUIDE.md step 8](DEPLOY-GUIDE.md#8-start-the-app-and-check-its-health), and choose a permanent one. Every new install starts with that same password, and the site is public.
- [ ] Create a second Super Admin under **Users**, so there is another way back in if one account is locked out.
- [ ] Run the rest of the sign-in checks in [DEPLOY-GUIDE.md step 11](DEPLOY-GUIDE.md#11-sign-in-and-verify-the-application): sign out and back in, refresh a direct URL, open each workspace, and try an import/export and a grievance attachment.
- [x] Connect the Zoho maintenance form ([DEPLOY-GUIDE.md step 15](DEPLOY-GUIDE.md#15-connect-the-zoho-maintenance-form)).
  - URL: `https://bphs-connect.com/api/webhooks/maintenance`
  - Header: `X-Webhook-Secret`, set to the secret the server already has.
  - Press **Test Webhook**, then submit one real entry and check it appears under Maintenance.
  - 2026-10-15: Test Webhook and a real form entry both arrived (201), with every field mapped.
- [ ] Remove the `MAINTENANCE_WEBHOOK_SECRET` export from `/root/.bash_aliases` on the VPS. The app reads the secret from `/etc/bphs-connect/compose.yml`, so it no longer needs to be there.

## Backups

- [ ] Connect Google Drive for off-site copies ([DEPLOY-GUIDE.md step 12](DEPLOY-GUIDE.md#12-schedule-backups-and-copy-them-off-the-vps)). It needs a browser sign-in on your computer.
  - Save both encryption passwords in your password manager. Without them, nobody can decrypt the Drive copies.
  - Then add `REMOTE=bphs-backup:` to the line in `/etc/cron.d/bphs-connect-backup`; a comment in the file shows where.
  - Copy `/etc/bphs-connect` and `/etc/nginx/sites-available` to Drive, as the guide shows.
- [ ] Get alerted when the newest backup is more than a day old. Nightly copies currently run at 02:15 UTC, and only to the VPS, logged to `/var/log/bphs-backup.log`.
- [ ] Practise a restore into a scratch volume ([RUNBOOK.md section 5.3](RUNBOOK.md#53-restore-into-a-scratch-volume-drill-or-to-inspect-old-data)).

## Development requests

- [x] Show a maintenance request's Date, Noticed and Zoho time in US format (10/15/2026 12:40 PM). Zoho sends day first and has no setting for it. Deployed 2026-10-16.
- [x] Per-section access (None, Read, Edit or Full in Assets, Grievances, Maintenance and Employees) in place of roles. Deployed 2026-10-16.
- [ ] Administrative Reviews: a fourth workspace for reviews of employees' work, their Corrective Action Plans (CAPs), files, a printable case file and a Review Audit Log ([the plan](administrative-review-implementation.md)). Built and checked locally, not deployed. When deploying: link every account except the first to its employee on **Users**, since an unlinked account cannot open Reviews; give each account its Reviews level; and print one case file from each browser.
- [ ] _Add requests here._ Build and check each one locally, then redeploy with [DEPLOY-GUIDE.md step 13](DEPLOY-GUIDE.md#13-deploy-later-updates), which takes a backup first.

## Maybe

- [ ] fail2ban for SSH. Password guessing can no longer get in, because SSH is key-only except for the host's web console. This would only quieten the logs.

## Done

- 2026-10-15: first deploy to the VPS at 50.6.205.113. HTTPS with automatic renewal, nightly local backups.
- 2026-10-15: SSH is key-only, except the host's web console at 50.87.241.21, which still signs in with a password (`/etc/ssh/sshd_config.d/10-keys-only.conf`).
- 2026-10-16: deployed `f433cbc` (section access and US maintenance dates) over `3e31bab`. Both accounts stayed Super Admin and every table kept its rows. Pre-deploy backup: `/srv/backups/bphs/bphs-20261016-133431.sqlite`.
