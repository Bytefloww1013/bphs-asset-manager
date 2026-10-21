# TODO

Things still to handle for BPHS-Connect. Tick an item off when it is done, and add new ones as they come up.

## Production (https://bphs-connect.com)

- [x] **Change the first Super Admin's password, urgently.** Sign in as `admin@bphs-connect.com` with the starting password from [DEPLOY-GUIDE.md step 8](DEPLOY-GUIDE.md#8-start-the-app-and-check-its-health), and choose a permanent one. Every new install starts with that same password, and the site is public.
- [x] Create a second Super Admin under **Users**, so there is another way back in if one account is locked out.
- [x] Run the rest of the sign-in checks in [DEPLOY-GUIDE.md step 11](DEPLOY-GUIDE.md#11-sign-in-and-verify-the-application): sign out and back in, refresh a direct URL, open each workspace, and try an import/export and a grievance attachment.
- [x] Connect the Zoho maintenance form ([DEPLOY-GUIDE.md step 15](DEPLOY-GUIDE.md#15-connect-the-zoho-maintenance-form)).
  - URL: `https://bphs-connect.com/api/webhooks/maintenance`
  - Header: `X-Webhook-Secret`, set to the secret the server already has.
  - Press **Test Webhook**, then submit one real entry and check it appears under Maintenance.
  - 2026-10-15: Test Webhook and a real form entry both arrived (201), with every field mapped.
- [ ] Remove the `MAINTENANCE_WEBHOOK_SECRET` export from `/root/.bash_aliases` on the VPS. The app reads the secret from `/etc/bphs-connect/compose.yml`, so it no longer needs to be there.

## Backups

- [x] Connect Google Drive for off-site copies ([DEPLOY-GUIDE.md step 12](DEPLOY-GUIDE.md#12-schedule-backups-and-copy-them-off-the-vps)). It needs a browser sign-in on your computer.
  - Save both encryption passwords in your password manager. Without them, nobody can decrypt the Drive copies.
  - Then add `REMOTE=bphs-backup:` to the line in `/etc/cron.d/bphs-connect-backup`.
  - Copy `/etc/bphs-connect` and `/etc/nginx/sites-available` to Drive, as the guide shows. Copy them again whenever they change.
  - 2026-10-21: rclone remotes `gdrive` and `bphs-backup:` set up, the cron line uploads each copy, and a backup sent by hand showed up in both listings.
- [ ] Check that the first nightly upload worked: on 2026-10-22, `/var/log/bphs-backup.log` should show an `uploaded: bphs-backup:bphs-20261022-…` line.
- [ ] Get alerted when the newest backup is more than a day old. Nightly copies run at 02:15 UTC, to the VPS and then to Google Drive, logged to `/var/log/bphs-backup.log`. A failed upload still leaves a fresh copy on the VPS, so also alert when the newest line in the log is not `uploaded:`.
- [ ] Practise a restore into a scratch volume ([RUNBOOK.md section 5.3](RUNBOOK.md#53-restore-into-a-scratch-volume-drill-or-to-inspect-old-data)).

## Open security findings

Still open from the 2026-10-14 security review, most serious first, checked against the code on 2026-10-21. The full review, with the reasoning behind each item, is `SECURITYREVIEW.md` in git history (`git show 6925196:SECURITYREVIEW.md`). The SR numbers refer to its sections. The backup items are under Backups above. Fix each in its own branch, not inside a feature.

- [ ] **Bootstrap with a known password (SR-18).** With no users, the app creates a Super Admin whose starting password is written in the repo (`server/bootstrap.ts`). If the volume is ever empty or mounted wrong, the public site starts with it. Require an explicit init step, or refuse to start with no users in production.
- [ ] **Multi-factor authentication (SR-06).** A public site holding HR data signs in with a password only. Choose SSO, a gateway, or local MFA, and require it for Super Admins first.
- [ ] **Absolute session lifetime (SR-11).** Sessions only slide, and remember-me extends 30 days at a time. Add a hard expiry, rotation, and "sign out everywhere".
- [ ] **Redact request logs (SR-12).** Hono's `logger()` writes full URLs, including grievance and review search terms, to the Docker logs.
- [ ] **Fail closed on config (SR-01).** A mistyped `COOKIE_SECURE` silently turns Secure cookies off. Reject unknown values in production.
- [ ] **Resource limits (SR-03, SR-04).** Password hashing has no global queue, and uploads have no per-user or total quota. Attachments live in the database, and every nightly backup copies all of them.
- [ ] **Private file modes (SR-08).** The database and in-volume backups are not created with private permissions. RUNBOOK section 4 says every copy is mode 600; fix the code or the claim.
- [ ] **Container hardening (SR-13).** Add `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and memory, CPU and PID limits to the production compose file.
- [ ] **Session-ended and sign-out behaviour (SR-17).** Case content shows through the session-ended dialog, and a failed sign-out looks like a successful one.
- [ ] **Upload scanning (SR-10).** Files are not virus-scanned and the DOCX/XLSX check is shallow. This is an accepted risk in the RUNBOOK; revisit before storing more sensitive files.
- [ ] **Supply chain (SR-14).** esbuild 0.18.20 (via drizzle-kit) is still in the lockfile. There is no CI, image scan or secret scanning, and the image is tagged `:latest` only.
- [ ] **Audit claims (SR-15).** RUNBOOK says every export is logged, but case-file prints are reported by the browser and reads are not audited. Make the runbook match what is guaranteed.
- [ ] **Policy and sign-off (SR-05, SR-16).** No approved grievance access matrix, data-retention policy, or disk-encryption decision. Incident contact fields in the RUNBOOK are blank.

## Development requests

- [x] Show a maintenance request's Date, Noticed and Zoho time in US format (10/15/2026 12:40 PM). Zoho sends day first and has no setting for it. Deployed 2026-10-16.
- [x] Per-section access (None, Read, Edit or Full in Assets, Grievances, Maintenance and Employees) in place of roles. Deployed 2026-10-16.
- [x] Administrative Reviews: a fourth workspace for reviews of employees' work, their Corrective Action Plans (CAPs), files, a printable case file and a Review Audit Log. Deployed (the live site serves `eacce4d`, the reviews case file). After deploying: link every account except the first to its employee on **Users**, since an unlinked account cannot open Reviews; give each account its Reviews level; and print one case file from each browser.
- [ ] Employee Tasks: a fifth workspace for assigning tasks to accounts, completed in My Space › Tasks, with a minute-by-minute task clock for scheduled sends and reminders. Built on `feature-task-system`, not deployed. Deploying adds migrations 0020–0022. After deploying: widen the nginx 101m location to `/api/reviews`, `/api/tasks` and `/api/me/tasks` ([DEPLOY-GUIDE.md step 9](DEPLOY-GUIDE.md#9-configure-nginx)), give each account its Tasks level on **Users**, and assign a test task with a send time a few minutes ahead to see the clock deliver it.
- [ ] _Add requests here._ Build and check each one locally, then redeploy with [DEPLOY-GUIDE.md step 13](DEPLOY-GUIDE.md#13-deploy-later-updates), which takes a backup first.

## Future TODOs

Ideas agreed on but not planned yet. Each gets its own `[feature]-plan.md` when its turn comes.

- [ ] **@mentions.** Typing `@` in a note or comment opens a list of people who have accounts, at the cursor, narrowed with each character typed. The person mentioned gets a notification with a link to where they were mentioned. Never in Grievances or Administrative Reviews. Builds on the notifications in My Space.
- [ ] **Custom notification triggers.** Rules such as "notify me when a new asset is assigned to my program" or "when an asset comes back in poor condition". Default audience: Edit/Full in the section plus Super Admins. The notifications tables are designed so this needs only a rules table.
- [ ] **Show many workspaces cleanly.** Staff keep asking for more features and workspaces. Employee Tasks makes five, and the workspace switcher is getting crowded: decide how it should look with many of them (grouped list, a launcher, search). The redesign is still to do.
- [ ] **Mailbox in My Space.** Messages between people, with replies.
- [ ] **Personal Dashboard in My Space.** A home page each person can arrange, within limits.
- [ ] **Delete the Zoho test submission.** The 2026-10-15 Test Webhook and test entry under **Maintenance**, if still there. Setting the secret and configuring the webhook are done (see Production above).

## Maybe

- [ ] fail2ban for SSH. Password guessing can no longer get in, because SSH is key-only except for the host's web console. This would only quieten the logs.

## Done

- 2026-10-15: first deploy to the VPS at 50.6.205.113. HTTPS with automatic renewal, nightly local backups.
- 2026-10-15: SSH is key-only, except the host's web console at 50.87.241.21, which still signs in with a password (`/etc/ssh/sshd_config.d/10-keys-only.conf`).
- 2026-10-16: deployed `f433cbc` (section access and US maintenance dates) over `3e31bab`. Both accounts stayed Super Admin and every table kept its rows. Pre-deploy backup: `/srv/backups/bphs/bphs-20261016-133431.sqlite`.
- 2026-10-21: encrypted off-site backups to Google Drive, through the rclone remote `bphs-backup:` (folder `bphs-backups`). Drive keeps 180 days of copies.
