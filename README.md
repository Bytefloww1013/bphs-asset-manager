# BPHS-Connect

<img src="web/public/brand/brightpath-header.svg" alt="Brightpath Human Services" width="280" height="83" />

Application: [BPHS-Connect](https://bphs-connect.com).

An internal register of company IT equipment: what exists, who holds it, since when, and what condition it was in at every handoff. Behind the same sign-in, a second workspace, the **Grievance Tracker**, keeps employee grievances with a timeline that is only ever added to, a third, **Maintenance**, tracks the work order requests staff send from a Zoho form, and a fourth, **Administrative Reviews**, keeps reviews of employees' work and the corrective action plans (CAPs) that follow from them, each hidden from the employee it is about. One TypeScript codebase: a React single-page app and a small API over a SQLite file, shipped as a single Docker container.

- **Front end:** React 19, Vite, Tailwind v4, TanStack Router, Query, Table (v9) and Form, Radix primitives, Lucide icons, Geist type (self-hosted).
- **Back end:** Hono on Node 24+, Drizzle ORM over `better-sqlite3`, Zod validation, scrypt password hashing, cookie sessions stored in SQLite.
- **No Django, no external services.** It runs on an office network with no internet. The one exception is optional: Maintenance requests arrive from Zoho Forms through an inbound webhook, which needs the server reachable from the internet. The app itself makes no outbound calls.

The design system lives in [DESIGN.md](DESIGN.md) and the product brief in [PRODUCT.md](PRODUCT.md). **Running it in production** (backups, restore, upgrades, account recovery, HTTPS, troubleshooting): [RUNBOOK.md](RUNBOOK.md).

## Run it locally

Requires [Bun](https://bun.sh) 1.3 or newer (package manager and script runner) and Node 24 or newer (what the app actually runs on).

```bash
bun install
bun run db:seed        # optional: synthetic demo data (employees, programs, 116 physical assets, 32 digital assets, 5 grievances, 5 administrative reviews, history, 6 users)
bun run dev            # API on :3000, app on http://localhost:5173
```

The seed prints the demo sign-ins (a Super Admin, an account with Edit access, a read-only account; it also makes one that must change its password, a locked one and a deactivated one). One of the reviews is about the Edit account's own employee, to show it is hidden from that account. It refuses to run when `NODE_ENV=production`. Without seeding, the first start creates one Super Admin with the password `Brightpath1!`, which must be changed at first sign-in.

The development API runs on Node through `tsx watch`, which restarts it when an imported file changes. This avoids the native file-watcher crash seen with Node 24's `--watch` mode when stopping the server.

Other scripts:

| Script | What it does |
| --- | --- |
| `bun run test` | API integration tests (auth, lockout, one-active-assignment, programs, digital assets, import, permissions, audit, grievances and their files, maintenance and its webhook, administrative reviews with their CAPs, files and who may see them) against an in-memory database |
| `bun run typecheck` | Strict TypeScript for `web/` and `server/` |
| `bun run build` | Builds the SPA to `dist/web` |
| `bun run start` | Production mode: builds the SPA first, so it is never an older one, then the API serves it from `dist/web` |
| `bun run db:generate` | Generate a new SQL migration from `server/db/schema.ts` (Drizzle Kit) |
| `bun run db:backup` | Safe online backup of the SQLite file |
| `bun run admin <command>` | Break-glass account recovery: `list`, `unlock <email>`, `reset-password <email>` (see the runbook) |

Bun only installs packages and runs these scripts; every script still executes on Node, because `better-sqlite3` is a native addon that Bun's runtime cannot load. Use `bun run test`, not `bun test`: the latter is Bun's own test runner, not Vitest. Commit `bun.lock`.

## Deploy with Docker

```bash
docker compose up -d --build
docker compose logs assets      # first run: shows the Super Admin email and starting password
```

Then open `http://<this-machine>:8080`, sign in with the starting password `Brightpath1!`, and choose a new one when asked. The database lives in the `bphs-data` volume at `/data/bphs.sqlite`. Migrations run automatically on start.

Configuration (environment variables, set in `docker-compose.yml`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container |
| `DATA_DIR` | `/data` | Where `bphs.sqlite` lives. Keep it on a local disk, not a network share (SQLite WAL) |
| `COOKIE_SECURE` | `false` | Set `true` only when users reach the app over HTTPS. On plain HTTP a Secure cookie is never stored and nobody can sign in |
| `SESSION_IDLE_HOURS` | `12` | Idle time before a session expires. A whole number of hours, 1 or more; the server will not start with anything else. A sign-in with "Keep me signed in" ticked lasts 30 idle days instead, with a cookie that survives closing the browser; untick it and the cookie ends with the browser |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` | `admin@bphs.local`, `Super Admin` | Used once, when the database has no users |
| `MAINTENANCE_WEBHOOK_SECRET` | unset | The shared secret Zoho Forms sends in the `X-Webhook-Secret` header with each maintenance request. Unset, the webhook answers 404 and requests can only be entered by hand. At least 32 characters (`openssl rand -hex 32`); the server will not start with a shorter one. Setup: DEPLOY-GUIDE step 15 |

Put a reverse proxy with TLS in front if you want HTTPS (and then set `COOKIE_SECURE=true`).

### Backups

```bash
docker compose exec assets node server/backup.ts        # writes /data/backups/bphs-<timestamp>.sqlite
```

This uses SQLite's backup API, so it is safe while the app is running. `scripts/backup-offbox.sh` does the same, checks the copy, and streams it to a folder on the host for cron. Restore and the rest of the operating procedures are in [RUNBOOK.md](RUNBOOK.md).

## What it does

Four workspaces, chosen at the top of the sidebar. **Assets**, sixteen screens:

| Screen | Route |
| --- | --- |
| Sign in | `/login` |
| Forced password change | `/password-change` |
| Overview (inventory, out the longest, condition watch, free stock, activity) | `/` |
| Physical Assets register with quick-add and spreadsheet paste | `/assets` |
| Asset detail with assignment and condition history | `/assets/BPHS-0102` |
| Active assignments with bulk return | `/assignments` |
| Available assets, with an `I` shortcut to issue | `/available` |
| Issue an asset (sheet) | any page, `?issue=<assetId>` or `?issue=new` |
| Return an asset (sheet, with the race-conflict state) | any page, `?return=<assignmentId>` |
| Digital Assets: license and account seats, one per row, issued to employees | `/digital-assets` |
| Employees with quick-add | `/employees` |
| Programs, which can hold physical assets the way an employee does | `/programs` |
| Lists: asset types, digital asset types and condition ratings | `/lists` |
| Import/Export: employees and programs in from CSV or Excel (map columns, preview, then commit); every list out as CSV or Excel | `/import-export` |
| Audit log (filter, search, CSV export) | `/audit` |
| Users (Super Admin only) | `/users` |

**Grievances**, ten screens:

| Screen | Route |
| --- | --- |
| Grievances: status tabs, filters, search | `/grievances` |
| New grievance, with files | `/grievances/new` |
| Grievance detail: facts, body, files, timeline, status, owner, void, case file | `/grievances/GR-2026-0001` |
| Edit grievance (needs a reason; earlier versions are kept) | `/grievances/GR-2026-0001/edit` |
| Earlier versions | `/grievances/GR-2026-0001/versions` |
| Add an action, event or correction, with files | `/grievances/GR-2026-0001/entries/new` |
| Entry detail | `/grievances/GR-2026-0001/entries/E03` |
| Case file: print layout, saved as a PDF from the print dialog | `/grievances/GR-2026-0001/case-file` |
| Grievance categories | `/grievances/categories` |
| Grievance audit log (filter, search, CSV export) | `/grievances/audit` |

**Maintenance**, Super Admins only, three screens:

| Screen | Route |
| --- | --- |
| Requests: Open, Finished, Rejected and All tabs, search | `/maintenance` |
| New request, for one that did not come through Zoho | `/maintenance/new` |
| Request detail: facts, description, who it is dispatched to, status, notes timeline, delete | `/maintenance/1` |

Requests sent from the Zoho form arrive at `POST /api/webhooks/maintenance`.

**Administrative Reviews**, twelve screens:

| Screen | Route |
| --- | --- |
| Reviews: status tabs, filters, search | `/reviews` |
| New review | `/reviews/new` |
| Review detail: facts, findings, review body, files, a timeline with its CAPs, summary, status, void, case file | `/reviews/AR-2026-0001` |
| Edit review (each edit is on the history, with what it replaced) | `/reviews/AR-2026-0001/edit` |
| Add an update or a correction, on the review or a CAP, with files | `/reviews/AR-2026-0001/entries/new` |
| Add a CAP, with files | `/reviews/AR-2026-0001/caps/new` |
| CAP detail: facts, details, files, its own history, status, mark complete | `/reviews/AR-2026-0001/caps/CAP01` |
| Edit CAP | `/reviews/AR-2026-0001/caps/CAP01/edit` |
| Case file: print layout, saved as a PDF from the print dialog | `/reviews/AR-2026-0001/case-file` |
| Action items: every CAP on every review, with CSV and Excel export | `/reviews/actions` |
| Employees | `/reviews/employees` |
| Review audit log (filter, search, CSV export) | `/reviews/audit` |

### Rules the system enforces

- One open assignment per asset, in the app **and** by a partial unique index in the database.
- Every issue and return records a condition snapshot (rating, assessor, notes). A handoff is a return then an issue.
- Assets and people with history are retired or archived, never deleted. Delete is Super Admin only and only for records with no history.
- The audit log is append-only. SQLite triggers reject any `UPDATE` or `DELETE` on it.
- Five wrong passwords lock an account for 15 minutes. New and reset accounts get a one-time password and must change it before any other page works (the API refuses everything else until then).
- A physical asset is held by exactly one employee or one program, never both and never neither, in the app **and** by a `CHECK` constraint in the database.
- A digital asset gets its Asset ID from the system (`DA-00001`, never typed, edited or reused), is issued to employees only, and reads Active while someone has it. Its License/Account field names a seat and refuses anything that labels itself a password, key or token: no credential is stored.
- An import only adds employees and programs. It never changes an existing record and never issues anything; a row whose ID already exists is skipped, so running the same file twice is safe. Each record created gets its own audit entry.
- A grievance gets its ID from the system (`GR-2026-0001`), and each entry on its timeline one of its own (`GR-2026-0001-E01`). Entries, earlier versions and file contents are never changed or deleted, in the app **and** by triggers in the database; a mistake is fixed by a correction entry linked to it. Status changes, new owners, edits and files add automatic entries.
- Only the owner's account or a Super Admin can edit a grievance, change its status or give it a new owner; voiding a grievance and withdrawing a file are Super Admin only. A Closed or Voided grievance takes no new entries or files. An edit made from an older version than the one saved is refused.
- Grievance files: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, checked by content, up to 10 MB each and 10 at a time, stored inside the database. Downloads are always a file to save, never shown in the page.
- The Grievance Audit Log is separate from the asset Audit Log and records every grievance change, download and print, by ID, title and filename only, never body text. The case file prints only after that entry is written.
- A maintenance request gets its ID from the system (`MR-0001`) and starts Not Started. Choosing an employee dispatches it; clearing the employee on a Dispatched request returns it to Not Started. Statuses are Not Started, Dispatched, On Hold, Rejected and Finished. Every dispatch, status change and note adds a line to its timeline, and a delete (Super Admin, after a confirmation) is recorded in the Audit Log by ID only. An employee dispatched on a request can be archived but not deleted.
- The webhook needs the shared secret in `X-Webhook-Secret` and a non-empty `description`; every other field may be missing, over-long text is cut rather than refused (Zoho does not retry), and the same entry sent twice (same email and Added Time) is stored once.
- A review gets its ID from the system (`AR-2026-0001`), each CAP a number within it (`CAP01`), and each entry on its history one of its own (`E01`). Entries and file contents are never changed or deleted, in the app **and** by triggers in the database; a mistaken update is fixed by a correction, a CAP added by mistake is cancelled with a reason, and a review entered by mistake is voided. Every change to the review or a CAP adds an automatic entry.
- A review is never shown to the account linked to its employee reviewed, whatever its level, Super Admin included: it is left out of every list, count, search, export and audit entry, and its address answers 404. So every account is linked to an employee (except the first account), and nobody can change their own account's link.
- The reviewer's account can manage the review with Read Only, as an owner can a grievance; Reviews Edit can manage any review. Voiding a review and withdrawing a file need Reviews Full. A review is Completed only when every CAP is Completed or Cancelled, and then takes no new CAPs, updates or files until it is reopened; a voided one never does. Review files follow the grievance file rules, and the Review Audit Log is a third log, kept apart from the other two.
- Access: each account has a level in each of Assets, Grievances, Maintenance, Administrative Reviews and Employees. **None** hides the section, **Read Only** sees it, **Edit** also adds and changes records, **Full** also deletes, archives, voids and withdraws. **Super Admin** is Full everywhere, including sections added later, and is the only way to manage accounts. The owner of a grievance can edit it, change its status and hand it on with Read; Grievances Edit can do that to any grievance. Employees are shared: every account can choose them in a form, Employees None only hides the Employees page, and each workspace shows only its own counts.

## Project layout

```
server/            Hono API: app.ts, routes/, services/ (business rules), db/ (Drizzle schema + SQL migrations), tests/
                   plus the command-line tools backup.ts, admin.ts and seed.ts
scripts/           backup-offbox.sh (scheduled, checked backups to the host)
shared/            Types, Zod schemas, password rules, permissions, the importable record types and the CSV reader and writer, used by both sides
web/src/           React app: routes/ (file-based), components/ui (kit), components/data-grid (TanStack Table), features/ (common/ holds the timeline, files, print, audit log and picker pieces that Grievances and Reviews share)
dist/web/          Built SPA (generated)
```

Node runs the server TypeScript directly (type stripping), so there is no server build step; imports use explicit `.ts` extensions and only erasable syntax. Business rules live in `server/services/*` and are covered by `server/tests/api.test.ts` and, for grievances, maintenance and reviews, `server/tests/grievances.test.ts`, `server/tests/maintenance.test.ts` and `server/tests/reviews.test.ts`.

## How it differs from the design spec

The design was reworked for legibility and comfort, not just restyled:

- Larger type (14px body, 12px floor), 36px controls, 56px rows, horizontal rules only, and measured contrast (the spec's greys were 1.7-2.6:1). Fully responsive down to a phone.
- The spec's Dashboard combined a metrics rail and the asset grid. Here **Overview** answers "what needs a decision" and **Physical Assets** is the register.
- The grid's live entry row became a **Quick add** panel above the table, so labels stay visible. Spreadsheet paste still adds many rows at once, after showing them for a last look.
- Issue and Return open as right-hand sheets rather than centred modals, and are still linkable.
- The design-time "viewing as" toggle is gone: access comes from the signed-in account, and unavailable actions are shown disabled with the reason.

## Known gaps and next steps

- Supplied Brightpath artwork, clean SVG logos, browser icons, the desktop login hero, and the measured navy palette are recorded in [BRAND-UPDATE.md](BRAND-UPDATE.md), including per-phase rollback. Official vector originals and an exact corporate color specification remain welcome.
- Bulk return applies one condition to every selected asset.
- No dark theme yet (the tokens are semantic, so it is additive).
- Backups and HTTPS are documented, not built in: schedule `scripts/backup-offbox.sh` and, if wanted, put a TLS proxy in front (see the runbook).
- The audit log export caps at 50,000 rows per download, and is CSV only.
- Only employees and programs can be imported. Physical and digital assets are added on their own pages (physical assets also by spreadsheet paste); each could become importable by adding one definition to `shared/importers.ts` and one creator to `server/services/imports.ts`.
- Every account that works in Grievances can read every grievance, and every account in Administrative Reviews every review except one about itself; there is no limit to named people.
- Review due dates are recorded but nothing is flagged overdue, and nobody is notified.
- The grievance and review case-file PDFs come from the browser's print dialog, so its page header and footer are the browser's.
- Grievance and review files live inside the database, so every backup holds all of them and backups grow with them (RUNBOOK section 4.2).
- Zoho Forms does not retry a webhook. A request sent while the app is down never arrives; it is still in the form's Entries in Zoho, and can be entered by hand (RUNBOOK section 9).
- Maintenance dates (Date, Noticed, Submitted in Zoho) are kept as the text Zoho sends, so they are shown but not sorted or filtered as dates.
- An import takes one file of at most 2,000 rows and 5 MB, reads the first sheet of a workbook, and does not read the old `.xls` format.
