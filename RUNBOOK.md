# BPHS-Connect: Runbook

**Brand compatibility:** the application is BPHS-Connect (https://bphs-connect.com), with Brightpath Human Services artwork. The repository/checkout `bphs-asset-manager`, image `bphs-asset-manager:latest`, container `bphs-assets`, service `assets`, and existing data-volume bindings are retained working identifiers. Branding does not rename them. Keep deployed Compose overrides and backup callers aligned; code/artwork rollback was in BRAND-UPDATE.md, now removed (git history before commit `1a562fe`). No infrastructure-name migration is included.

How to run, back up, restore, upgrade and rescue the production deployment. For building and changing the code, see the [README](README.md).

Commands assume you are in the project folder on the server (the one with `docker-compose.yml`).

## 1. At a glance

| | |
| --- | --- |
| What it is | One Docker container: Node 24 serves the API and the built web app, with a SQLite file as the database |
| Compose service / container / image | `assets` / `bphs-assets` / `bphs-asset-manager:latest` |
| URL | `http://<server>:8080` (host port 8080 maps to port 3000 in the container) |
| Data | Docker volume `bphs-data` (real name `<project-folder>_bphs-data`, see `docker volume ls`), mounted at `/data` |
| Database file | `/data/bphs.sqlite` (WAL mode, so `-wal` and `-shm` files appear beside it while it runs) |
| Backups made in the container | `/data/backups/bphs-<UTC timestamp>.sqlite` |
| Health check | `GET /api/health` returns `{"ok":true}`. Docker polls it every 30 s. It confirms the process is serving, not that the database is healthy |
| Logs | `docker compose logs assets` (one line per request; rotated at 10 MB x 5 files) |
| Runs as | Unprivileged user `node` inside the container |

**Fill in for your site**

| | |
| --- | --- |
| Server / host name | |
| Owner of this system | |
| Where off-box backups go | Google Drive, encrypted, through the rclone remote `bphs-backup:` (DEPLOY-GUIDE.md step 12) |
| Who to call if the owner is out | |

## 2. Everyday operations

```bash
docker compose ps                                  # state and health
curl -fsS http://localhost:8080/api/health         # {"ok":true}
docker compose logs -f --tail 100 assets           # follow the log
docker compose stop assets                         # graceful stop (finishes requests, closes the database)
docker compose start assets                        # start it again
docker compose restart assets                      # stop then start
docker compose up -d                               # create/recreate after editing docker-compose.yml
```

The container restarts itself after a crash or a server reboot (`restart: unless-stopped`) unless you stopped it on purpose.

Changing an environment variable (for example `SESSION_IDLE_HOURS`): edit `docker-compose.yml`, then `docker compose up -d`. Variables are listed in the README.

## 3. First deployment

```bash
docker compose up -d --build
docker compose logs assets          # find the FIRST RUN box
```

The first start finds no users and creates one Super Admin (`BOOTSTRAP_ADMIN_EMAIL`, default `admin@bphs.local`). Its starting password is `Brightpath1!`. Sign in at `http://<server>:8080`; the app makes you choose a new password straight away.

- This only happens when the database has **no users**. Starting against an existing database never creates or changes accounts.
- The starting password is the same for every new install, so sign in and change it as soon as the server is reachable. It is worthless once changed.
- Then: create a second Super Admin on the Users screen, so one lost password is never an outage (the app always keeps at least one active Super Admin).
- Set up the off-box backups in section 4 the same day.

## 4. Backups

Everything the system knows is in `/data/bphs.sqlite`. Back up that, and nothing else matters.

### 4.1 Take one by hand

```bash
docker compose exec assets node server/backup.ts
```

This uses SQLite's backup API, so it is safe while people are working. It writes `/data/backups/bphs-<timestamp>.sqlite`, a single self-contained file. It never writes over an existing file.

A backup **inside the volume does not protect you** from losing the volume (disk failure, `docker volume rm`, a bad `docker compose down -v`). It needs to be copied off the machine.

### 4.2 Scheduled, off-box (recommended)

`scripts/backup-offbox.sh` takes a backup, runs SQLite's `integrity_check` on it, streams it to a folder on the host, and tidies up old copies. A failed check or an empty copy stops the script with a non-zero exit, and a copy that fails the check is removed from the volume, so nothing damaged is kept as a "good" backup. Old copies are tidied up after a failed run too.

Try it once by hand:

```bash
DEST=/srv/backups/bphs ./scripts/backup-offbox.sh
```

Then schedule it (`crontab -e` for a user who may run `docker`; adjust the path):

```cron
15 2 * * * DEST=/srv/backups/bphs /opt/bphs-asset-manager/scripts/backup-offbox.sh >> /var/log/bphs-backup.log 2>&1
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONTAINER` | `bphs-assets` | Container to back up |
| `DEST` | `/srv/backups/bphs` | Host folder for the copies |
| `KEEP_DAYS` | `30` | Host copies older than this are deleted |
| `REMOTE` | none | rclone remote that each copy is also uploaded to, for example `bphs-backup:`. Empty means no upload. A failed upload exits non-zero |
| `REMOTE_KEEP_DAYS` | `180` | Remote copies older than this are deleted |

Copies kept inside the volume are pruned after 7 days. Files are created owner-only (mode 600) because they contain password hashes and employee records, and, from the Grievance Tracker, Administrative Reviews and Employee Tasks, the full text of every grievance, review and task, with every file attached to them. Treat every copy, including the off-box ones, with the same care as HR files: limit who can read them, and keep them off shared drives.

**Watch the size.** Every copy is the whole database, and 30 of them are kept on the host. The Grievance Tracker, Administrative Reviews and Employee Tasks store file attachments inside the database, and nothing is ever deleted (a withdrawn file keeps its bytes; only deleting a whole task removes its files), so each nightly copy contains every attachment ever added and the copies only grow: 1 GB of attachments is about 30 GB of backups. A task sent to several people stores its files once for each of them, up to 200 MB per assignment. Check now and then with `du -sh /srv/backups/bphs`. If size becomes a problem, review other ways of storing attachments, such as keeping the files on the data volume with only their details in the database, so a backup run copies just the files that are new or changed instead of all of them every night.

Then get the copies off the machine too: set `REMOTE` (DEPLOY-GUIDE.md step 12 sets up an encrypted Google Drive remote), or use rsync to another host, your backup tool, or a USB rotation. One copy on the same disk is not a backup.

**Know when it stops working.** Cron fails silently. Alert on a stale backup, for example from your monitoring tool:

```bash
find /srv/backups/bphs -name 'bphs-*.sqlite' -mtime -1 | grep -q . || echo "BPHS backup is more than a day old"
```

### 4.3 Practise the restore

Once a quarter, restore the newest backup into a scratch volume (section 5.3) and check it. A backup you have never restored is a hope.

## 5. Restore

A restore **rolls back everything since the backup**: assets issued and returned, new employees, user accounts, password changes, grievances with their entries, edits and files, reviews, tasks with their files, notifications, and the audit logs. Tell people which window was lost. Anyone who changed their password after the backup was taken will need a reset (section 6).

### 5.1 Restore into the live system

You need the backup file on the host (for example `/srv/backups/bphs/bphs-20261011-021500.sqlite`).

```bash
# 1. Stop the app so nothing is writing to the database.
docker compose stop assets

# 2. Move the current database aside (not deleted) and load the backup in its place.
#    The stale -wal/-shm files must go with the old database, so the pattern matches all three.
docker compose run --rm -T assets sh -c \
  'set -e; d=/data/pre-restore-$(date -u +%Y%m%d-%H%M%S); mkdir "$d"; mv /data/bphs.sqlite* "$d"/; cat > /data/bphs.sqlite' \
  < /srv/backups/bphs/bphs-20261011-021500.sqlite

# 3. End every session in the restored copy. Otherwise a browser that still holds a cookie from before the backup
#    is signed in again, even for an account that was deactivated or reset since. Everyone signs in afresh.
docker compose run --rm -T assets node -e "new (require('better-sqlite3'))('/data/bphs.sqlite').exec('delete from sessions')"

# 4. Start and check.
docker compose start assets
curl -fsS http://localhost:8080/api/health
docker compose exec assets node server/admin.ts list     # the accounts you expect
```

Sign in and look at the Physical Assets, Audit log and Grievances screens to confirm the data is from the time you expected.

If it was the wrong backup, repeat from step 1 with another file. The database you replaced is in `/data/pre-restore-<timestamp>/` inside the volume; delete those folders once you are sure.

Why the file goes in through stdin rather than a bind mount or `docker cp`: on this host, bind mounts into the container failed with "Permission denied" because the container user is not your login user. Streaming avoids it.

### 5.2 If the container will not start after a restore

```bash
docker compose logs --tail 50 assets
```

Look for a SQLite error naming the file. A truncated or wrong file shows up here. Re-run 5.1 with a different backup.

### 5.3 Restore into a scratch volume (drill, or to inspect old data)

```bash
docker volume create bphs-scratch
docker run --rm -i -v bphs-scratch:/data bphs-asset-manager:latest sh -c 'cat > /data/bphs.sqlite' < /srv/backups/bphs/bphs-20261011-021500.sqlite
docker run --rm -v bphs-scratch:/data bphs-asset-manager:latest node server/admin.ts list
docker volume rm bphs-scratch
```

To browse the scratch data in the app, run a second container on another port against that volume before you remove it (`docker run --rm -p 8081:3000 -e COOKIE_SECURE=false -v bphs-scratch:/data bphs-asset-manager:latest`).

## 6. Locked out: account recovery

Use this when nobody can sign in (every Super Admin locked, or the only Super Admin forgot their password). For ordinary cases a Super Admin can do both of these on the **Users** screen; this command line is for when that is impossible. It is the only way to act on accounts without signing in, so it is limited to whoever has shell access to the server.

```bash
docker compose exec assets node server/admin.ts list                              # accounts and their state
docker compose exec assets node server/admin.ts unlock someone@company.example    # clear a lock
docker compose exec assets node server/admin.ts reset-password admin@bphs.local   # new one-time password
```

If the app is down, use `docker compose run --rm assets node server/admin.ts ...` instead of `exec`.

- `reset-password` prints a one-time password. Give it to the person over a channel you trust. It also signs that account out everywhere, clears any lock, and forces a password change at the next sign-in.
- A deactivated account stays deactivated: a Super Admin must reactivate it on the Users screen (the command tells you).
- Every change is recorded in the audit log with the actor `server-cli`.
- Email addresses are matched case-insensitively. An unknown address or a missing database exits with an error and changes nothing.

Lockout rule, for reference: 5 wrong passwords lock an account for 15 minutes. It clears by itself.

## 7. Upgrading

Database migrations run automatically when the new version starts, and they only go forward. So take a backup first, and treat rolling back as "restore that backup".

```bash
git pull                                              # or copy in the new version
docker compose exec assets node server/backup.ts      # pre-upgrade safety copy (also run the off-box script)
docker compose up -d --build                          # rebuild the image and recreate the container
docker compose logs --tail 50 assets                  # expect "listening on :3000" and no errors
curl -fsS http://localhost:8080/api/health
```

Expect a short gap (seconds) while the container is recreated. Sessions live in the database, so people stay signed in.

The notifications release adds migration `server/db/migrations/0017_notifications.sql` (notifications and notices). Like every migration it runs on the first start and cannot be undone, so take the backup above before upgrading to it.

It is followed by `0018_drop_notification_mutes.sql`, which removes muting (it drops the mutes table and the `muted` column, so any mutes people set are gone), and `0019_notification_source_index.sql`, which adds an index for the overdue reminders. Take the same backup first. `server/admin.ts` now runs pending migrations too, so the break-glass commands work on a database the server has not started on yet.

The Employee Tasks release adds `0020_tasks.sql` (tasks and their history), `0021_task_attachments.sql` (task files, and whether a task requires one) and `0022_tasks_unsent_index.sql` (an index for the task clock). Take the same backup first. After upgrading, every existing account has Tasks None: give a Tasks level on the Users screen to whoever should assign tasks (Assign) or oversee them (Read, Edit or Full). Everyone sees tasks assigned to them in My Space either way.

**Housekeeping timer.** Every 6 hours (and once at start) the server signs out expired sessions, deletes notifications and notices over a year old, read or not, and sends the overdue-asset reminders (once per assignment). Nothing needs scheduling outside the container.

**Task clock.** Every minute (the first tick a minute after start) the server delivers tasks whose send time has come, notifies assigners of tasks newly past due, and sends the past-due reminders due at that minute. It marks what it has sent, so a restart neither repeats nor loses a delivery; a reminder day missed entirely while the server was down is skipped. It logs nothing when healthy. A task it cannot handle logs `Task clock: task <id> failed` and the others still run; a broken clock logs an error every minute. Check with `docker compose logs --since 1h assets | grep -iA3 "task clock\|error"`. To see it work, assign a test task to yourself with a send time two minutes ahead: it should appear in My Space › Tasks, with a notification, within a minute of that time.

**Rolling back:** check out the previous version, restore the pre-upgrade backup (5.1) and rebuild (`docker compose up -d --build`). Do not run an older version against a database a newer version has migrated.

**Cleaning up:** old images pile up with every rebuild: `docker image prune` (removes dangling images only).

## 8. HTTPS and reverse proxy

The container speaks plain HTTP. If you put a TLS-terminating proxy in front (recommended whenever people sign in over anything but a trusted office LAN):

1. In `docker-compose.yml` set `COOKIE_SECURE: 'true'`, and publish the port to the proxy only: `'127.0.0.1:8080:3000'`. Then `docker compose up -d`. People may need to sign in again.
2. The proxy needs no special headers. The app does not read `Host` or any `X-Forwarded-*` header: whether the cookie is marked Secure depends on `COOKIE_SECURE` alone, which is why step 1 is not optional.
3. Raise the proxy's request-size limit. Most requests are small, but two kinds are not: the Import/Export page sends a file's rows as JSON (the API accepts up to 4 MB), and grievance, review and task file uploads send up to 10 files of 10 MB each in one request (the API accepts up to 101 MB, on the upload paths only). nginx's default of 1 MB would reject both with a 413. The sketch below allows 101 MB on the grievance, review and task paths (including `/api/me/tasks`, where an assignee completes a task with files) and keeps 4 MB everywhere else.
4. Do not let the proxy replace the app's `Content-Security-Policy` header. If you must set your own, keep `worker-src 'self' blob:` (see section 10), or large Excel files will stop importing and exporting.

Sketch for nginx (adapt names and certificate paths; **not tested here**):

```nginx
server {
  listen 443 ssl;
  server_name assets.example.com;
  ssl_certificate     /etc/ssl/assets.crt;
  ssl_certificate_key /etc/ssl/assets.key;
  client_max_body_size 4m;
  location / {
    proxy_pass http://127.0.0.1:8080;
  }
  location ~ ^/api/(grievances|reviews|tasks|me/tasks)(/|$) {
    client_max_body_size 101m;
    proxy_pass http://127.0.0.1:8080;
  }
}
```

Do not set `COOKIE_SECURE: 'true'` while users still reach the app over plain `http://`: the browser will refuse to store the cookie, and every sign-in will appear to succeed and then bounce back to the sign-in page.

## 9. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Sign-in "works" then returns to the sign-in page | `COOKIE_SECURE` is `true` but users are on plain HTTP. Use HTTPS, or set it to `false` and `docker compose up -d` |
| "Account locked" | 5 wrong passwords. Wait 15 minutes, or a Super Admin unlocks it, or `admin.ts unlock` (section 6) |
| Forced to change password on every sign-in | Expected after an admin reset. Choose a new one (8+ characters, upper and lower case, a digit, a special character) |
| Container shows `unhealthy` or keeps restarting | `docker compose logs --tail 100 assets`. Most common: the `/data` volume is not writable by the `node` user (if you replaced the named volume with a bind mount, `chown 1000:1000` the folder), or the database file is corrupt (restore, section 5) |
| `database is locked` errors, or odd write failures | `DATA_DIR` is on a network share. SQLite in WAL mode needs a local disk |
| Port 8080 already in use | Change the left number in `ports:` in `docker-compose.yml`, then `docker compose up -d` |
| Import or a grievance, review or task file upload fails with 413 or "payload too large" | A reverse proxy in the way has a small body limit (section 8). Raise it to 4 MB, and to 101 MB for `/api/grievances`, `/api/reviews`, `/api/tasks` and `/api/me/tasks`. Without a proxy, the app itself refuses one file over 10 MB or more than 10 at once, with that reason |
| Import refuses the file before any preview | Over 2,000 rows or 5 MB (split it), the old `.xls` format (save as `.xlsx` or `.csv`), or no header in the first row. Only the first sheet of a workbook is read |
| A large Excel file never finishes reading, or an Excel export never downloads | Something is overriding the page's `Content-Security-Policy` and blocking `worker-src blob:` (a proxy or a browser policy; section 8). CSV import and export do not need it |
| Audit log export is cut short | Exports cap at 50,000 rows per download. Narrow the filters and export in pieces |
| Disk filling up | `docker system df`, then `du` the volume. Logs rotate by themselves, in-volume backups are pruned after 7 days by the backup script (if you do not run the script, delete old files in `/data/backups`), and `/data/pre-restore-*` folders are yours to delete |
| Server reboot, app not back | `docker compose ps`. If Docker itself did not start, fix that first. If the container was stopped on purpose earlier, `docker compose start assets` |

### Maintenance requests from Zoho

Zoho Forms posts each *Maintenance Work Order Request* entry to `POST /api/webhooks/maintenance` with the shared secret in `X-Webhook-Secret`. Setup and the first test are in [DEPLOY-GUIDE.md step 15](DEPLOY-GUIDE.md#15-connect-the-zoho-maintenance-form).

- **A request is missing.** Zoho does not retry, so an entry submitted while the app was down or restarting never arrives. Find it in Zoho Forms under the form's **Entries** and enter it by hand: **Maintenance → New request**. A request entered by hand has no Submitted in Zoho time; its timeline says who entered it.
- **None arrive.** Open the webhook in Zoho and press **Test Webhook**. The response says why: `401`, the header and the server's `MAINTENANCE_WEBHOOK_SECRET` differ; `404`, the server has no secret set; `400`, no `description` arrived, and `docker compose logs assets | grep -i maintenance` lists the parameter names that did (never their values).
- **A field is empty on every request.** Its Parameter Name in Zoho is misspelled or missing (they are case-sensitive; the list is in DEPLOY-GUIDE step 15). Fixing it fills in new requests only.
- **Rotating the secret** (someone who should not have it might, or as routine). Make a new one with `openssl rand -hex 32`, put it in `MAINTENANCE_WEBHOOK_SECRET` and run `docker compose up -d`, then paste the same value into the Zoho webhook's `X-Webhook-Secret` header and save. Do the two back to back: entries submitted in between are refused and must be entered by hand. Press **Test Webhook** to confirm, and delete any request it creates.
- **Turning it off.** Remove `MAINTENANCE_WEBHOOK_SECRET` and `docker compose up -d`. The webhook then answers 404; requests already stored stay, and hand entry still works.

### "Why can't I...?" (rules the system enforces, not faults)

| Request | Why it is refused |
| --- | --- |
| Issue an asset that is already issued | One open assignment per asset. Return it first |
| Delete an asset | Anything with history cannot be deleted. Retire it instead. Only Assets Full can delete, and only assets that never had an assignment |
| Retire an asset someone holds | Return it first |
| Archive an employee who holds assets | Return their assets first |
| Deactivate yourself, or the last active Super Admin | Blocked so the system always has a way in |
| Two people return the same asset at once | The second gets a conflict message showing who got there first. Refresh and retry |
| Edit a grievance, change its status or give it a new owner | Only the owner's account (the user linked to the employee named as Owner) or an account with Grievances Edit can. If the owner has no account, only Grievances Edit can |
| Add an entry or a file to a Closed grievance | Closed and Voided grievances take nothing new. The owner or Grievances Edit reopens it first; a Voided one stays voided |
| Change or delete an entry | Entries are never changed. Add a correction linked to it |
| Delete an attached file | Files are never deleted. Grievances Full (Reviews Full for a review file) can withdraw one, with a reason: it stops downloading but stays listed. A task file can be withdrawn by whoever added it or anyone who may edit the task; only deleting the task removes it |
| Save an edit: "was edited by … while you had it open" | Someone else saved first and nothing of yours was saved. Reload, check their change, and edit again |
| Delete an employee named on a grievance, or archive one who owns an open grievance | The grievance needs them. Give it a new owner, or close or void it, before archiving |
| See Maintenance, or Employee Tasks | It needs Read in that section, given on the Users screen; without it the workspace is not in the switcher. Tasks assigned to you are in My Space › Tasks whatever your level |
| Set a maintenance request to Dispatched | Choose who it is dispatched to first. Choosing someone sets Dispatched by itself |
| Delete an employee dispatched on a maintenance request | The request's history needs them. Archive them instead |
| See a review about yourself | Never, at any level, Super Admin included. A review is hidden from the account linked to its employee reviewed, and its link answers "not found". Someone else with access to Administrative Reviews has to look |
| Open Administrative Reviews from an account with no linked employee | Reviews needs to know who the account is, to hide the reviews about them. A Super Admin links it to its employee on the Users screen. Nobody can change their own account's link |
| Change or cancel a task | Assign can change or cancel only the tasks it assigned; Tasks Edit any task, except one a Super Admin assigned, which needs Tasks Full. Deleting needs Tasks Full. A Completed or Cancelled task cannot be changed, and one Awaiting Approval must be sent back first |
| Approve a task you were assigned | Never: the assigner or Tasks Edit approves it. A task you assign yourself cannot need approval |
| Mark a task complete | It needs a file first if the assigner required one |
| Change a task's send time | Once a task has been sent, its send time is fixed. A new send time cannot be in the past |
| Change a review, its CAPs or their status | Only the reviewer's account (the user linked to the employee named as Reviewed by) or an account with Reviews Edit can |
| Complete a review | Every CAP must be Completed or Cancelled first. Cancelling a CAP needs a reason |
| Add a CAP, an update or a file to a Completed review | Reopen it first with Change status. A Voided review stays voided |
| Delete an employee named on a review, or archive one who is the reviewer on an open review or responsible for an open CAP | The review needs them. Name someone else, or finish or cancel the work, before archiving |

## 10. Security notes

- **Who can do what.** Each account has a level in each section (None, Read Only, Edit, Full; Employee Tasks also has Assign). Deleting, archiving, voiding and withdrawing files need Full in that section; managing users and sending notices are Super Admin only. **Every account can read every grievance**: there are no per-grievance limits, so give accounts only to people who may see all of them. The same goes for Administrative Reviews, with one exception: a review is never shown to the account linked to the employee it is about, at any level, so every account must be linked to its own employee.
- **The audit logs are append-only inside the app and inside the database** (triggers refuse `UPDATE` and `DELETE` on them). There are three: the Audit Log for assets, employees and accounts; the Grievance Audit Log, which records every grievance change, file download and export with IDs, titles and filenames but never body text; and the Review Audit Log, which does the same for reviews. The grievance and review entries, earlier versions and file contents are append-only the same way; a file can be withdrawn once, which keeps its bytes. That guards against mistakes and misuse of the app. It does not stop someone with access to the server or the volume, who can replace the whole file. Restrict shell and Docker access to the server accordingly, and keep off-box backups: they are your independent record.
- **Backups and the volume contain everything**: employee names and IDs, password hashes (scrypt), hashed session tokens, every grievance's, review's and task's text and attached files, and every maintenance request with the requester's name and email. Keep them owner-only and out of shared folders.
- **Passwords** are stored as scrypt hashes; sessions as hashes in the database, so a copy of the database does not hand over working sessions.
- **No outbound calls.** The app needs no internet access, and sends nothing anywhere. The one thing that comes in from outside is the Zoho maintenance webhook. It only creates requests: it cannot read, change or delete anything, and it is refused without the shared secret, which is compared in constant time and travels in a header, so it never appears in the Nginx access log.
- **Imported files stay in the browser.** A `.csv` or `.xlsx` chosen on Import/Export is opened by the page, and only its rows are sent, as JSON, to be validated again by the server. The server never opens a workbook. Reading and writing Excel files of any size zips in a Web Worker the page starts from a `blob:` URL, so the Content-Security-Policy carries `worker-src 'self' blob:`. Scripts are still limited to the app's own (`script-src 'self'`), and only a script the page already runs can create such a URL.
- **Grievance and review files are never shown in the page.** Uploads are accepted only as PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, checked by their content as well as their name, up to 10 MB each. Downloads are always sent as a file to save (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`), so a file cannot run as part of the app. Files are not virus-scanned: the staff who open them rely on their own machine's protection.
- **No credentials in digital assets.** The License/Account field refuses values that label themselves a password, key or token. That catches the obvious cases; it cannot recognise a bare secret, so tell staff the field is for naming a seat.
- **Notifications stay in the app.** No email or push is sent. Each account reads and changes only its own notifications (another account's ID answers "not found"), a notification links only to a path inside the app (checked when it is written and again when it is opened), and it names the thing it is about, never sensitive details. Grievances and Administrative Reviews never send notifications. Task notifications name the task's title. Only Super Admins send notices; each one is in the Audit Log.
- **Secrets.** The one secret is `MAINTENANCE_WEBHOOK_SECRET`, shared with the Zoho webhook. Anyone who can edit the form's integrations in Zoho can read it, and anyone who has it can create maintenance requests; rotate it as in section 9 when that is a worry. There are no API keys. The first Super Admin's starting password (`Brightpath1!`) is known in advance, so it must be changed at first sign-in, which the app enforces.

## 11. What has been verified

Checked by running them against a real container and scratch Docker volumes while building this project and writing this runbook:

- Health check, first-run Super Admin, and password change.
- Online backup (`server/backup.ts`) producing a single self-contained file, and the off-box script: success, wrong container name (exits 1, no file left), integrity check, host-side pruning, owner-only permissions.
- Restore into a volume holding a damaged database with stale `-wal`/`-shm` files: old files moved aside, backup loaded, `integrity_check` ok, accounts listed.
- Account recovery commands, including audit entries and exit codes (automated tests in `server/tests/admin-cli.test.ts`).
- Import/Export in a real browser (headless Firefox) against the production build, Oct 12 2026: a `.csv` with other header names, a hand-mapped file, a 1.6 MB `.xlsx` of 2,000 rows (read in a Web Worker under the app's Content-Security-Policy) and a programs `.xlsx`, each previewed and imported; the refusals (2,001 rows, `.xls`, a file that is not a workbook, a header with nothing under it); every export as CSV and as Excel, the Employees workbook of over 2,000 rows zipped in a worker. The Excel files were checked for the right name, type and zip signature only; none was opened in Excel itself.
- Grievances in real browsers (headless Firefox and headless Chromium, Playwright) against the production build, Oct 13 2026, on a scratch data directory. In both browsers the following worked:
  - Create a grievance with a file, edit it with a reason, add an action and an event with a file, and correct an entry.
  - A renamed file is refused. Attach, download (as a file to save) and withdraw work; a withdrawn file then answers 410.
  - Status changes work, Closed needs a note, and a Super Admin can void a grievance. A voided grievance is listed under All only.
  - An Admin who is not the owner sees Edit, Change status, Change owner and Void disabled, with the reason.
  - The case file is shown for printing only once its export is logged.
  - The Excel workbook was read back and had its four sheets.
  - The Grievance Audit Log page and its CSV work, and the asset Audit Log holds no grievance entries.
  - A keyboard-only pass of the New grievance form, typing the date into the date field, works.
  - When a session ends mid-edit, the sign-in-again dialog appears and the typed text is still there.
  - The browser console showed no errors except the expected 401s and 422.

  Headless browsers have no print dialog, so the case file was checked as the page the browser would print, not as a print preview. **Firefox's page-number footer and the printed PDF itself were not seen**: print one case file from each browser the first time you use it.

  This check found and fixed three bugs:
  - The audit log showed no grievance ID on file entries.
  - In Firefox, a date being typed was wiped.
  - Zod's eval probe broke the Content-Security-Policy.
- Maintenance in headless Chromium (Playwright) against the production build, Oct 15 2026, on a scratch data directory and a throwaway secret: entries posted to the webhook as Zoho would, the list's tabs and search, dispatching through the employee picker, a status change and a note, hand entry with its validation, delete with its confirmation, an unknown ID, and phone width. The webhook's secret checks, lenient reading, duplicates and rules are covered by `server/tests/maintenance.test.ts`, and who may open Maintenance by `server/tests/access.test.ts`. **A real Zoho post was not seen**: do the test in DEPLOY-GUIDE step 15 the first time.
- Administrative Reviews in headless Chromium (Playwright) against the production build, Oct 17 2026, on freshly seeded data, at 1400 px and at 390 px wide:
  1. Marcus (Reviews Edit) recorded a review through the form, with Rosa as the reviewer and Priya as the employee reviewed.
  2. Rosa (Reviews Read Only, but the reviewer) added three CAPs and an update on CAP01 with a file.
  3. Rosa completed CAP01. Completing the review was then refused while two CAPs were open. She cancelled CAP02 with a reason and completed CAP03.
  4. Rosa completed the review and printed its case file; the export was in the audit log.
  5. Priya, a Super Admin, could not find it in the review list (All, searched by ID), Action items (All, searched), the audit log (searched) or the API. Its review, CAP and case file links each answered "No review with that ID".

  No sideways scrolling at either width. The console showed only the expected "Review not found" for Priya. Access rules, sealing and the employee guards are covered by `server/tests/reviews.test.ts`. **The printed PDF from Firefox was not seen**: print one review case file from each browser the first time.
- Graceful shutdown on SIGTERM (exit 0), log rotation settings (accepted by `docker compose config`), and that the cookie is `HttpOnly; Secure; SameSite=Lax` when `COOKIE_SECURE=true`.

**Not exercised**, so check them the first time you use them:

- The nginx snippet in section 8.
- `docker compose stop`/`restart` on the production container (the build sandbox did not allow stopping a running container; the underlying SIGTERM handling was tested).
- The cron line in section 4.2 (the script it calls was run by hand).
- Running a second container on a scratch volume to browse old data (end of section 5.3).
