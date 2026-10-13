# BPHS Asset Management

An internal register of company IT equipment: what exists, who holds it, since when, and what condition it was in at every handoff. Behind the same sign-in, a second workspace, the **Grievance Tracker**, keeps employee grievances with a timeline that is only ever added to. One TypeScript codebase: a React single-page app and a small API over a SQLite file, shipped as a single Docker container.

- **Front end:** React 19, Vite, Tailwind v4, TanStack Router, Query, Table (v9) and Form, Radix primitives, Lucide icons, Geist type (self-hosted).
- **Back end:** Hono on Node 24+, Drizzle ORM over `better-sqlite3`, Zod validation, scrypt password hashing, cookie sessions stored in SQLite.
- **No Django, no external services.** It runs on an office network with no internet.

The design system lives in [DESIGN.md](DESIGN.md) and the product brief in [PRODUCT.md](PRODUCT.md). **Running it in production** (backups, restore, upgrades, account recovery, HTTPS, troubleshooting): [RUNBOOK.md](RUNBOOK.md).

## Run it locally

Requires [Bun](https://bun.sh) 1.3 or newer (package manager and script runner) and Node 24 or newer (what the app actually runs on).

```bash
bun install
bun run db:seed        # optional: synthetic demo data (employees, programs, 116 physical assets, 32 digital assets, 5 grievances, history, 5 users)
bun run dev            # API on :3000, app on http://localhost:5173
```

The seed prints the demo sign-ins (a Super Admin, an Admin, an account that must change its password, a locked account, a deactivated one). It refuses to run when `NODE_ENV=production`. Without seeding, the first start creates one Super Admin and prints a one-time password in the terminal.

Other scripts:

| Script | What it does |
| --- | --- |
| `bun run test` | API integration tests (auth, lockout, one-active-assignment, programs, digital assets, import, permissions, audit, grievances and their files) against an in-memory database |
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
docker compose logs assets      # first run: shows the Super Admin email and one-time password
```

Then open `http://<this-machine>:8080`, sign in with the one-time password, and choose a new one when asked. The database lives in the `bphs-data` volume at `/data/bphs.sqlite`. Migrations run automatically on start.

Configuration (environment variables, set in `docker-compose.yml`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container |
| `DATA_DIR` | `/data` | Where `bphs.sqlite` lives. Keep it on a local disk, not a network share (SQLite WAL) |
| `COOKIE_SECURE` | `false` | Set `true` only when users reach the app over HTTPS. On plain HTTP a Secure cookie is never stored and nobody can sign in |
| `SESSION_IDLE_HOURS` | `12` | Idle time before a session expires. A whole number of hours, 1 or more; the server will not start with anything else |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` | `admin@bphs.local`, `Super Admin` | Used once, when the database has no users |

Put a reverse proxy with TLS in front if you want HTTPS (and then set `COOKIE_SECURE=true`).

### Backups

```bash
docker compose exec assets node server/backup.ts        # writes /data/backups/bphs-<timestamp>.sqlite
```

This uses SQLite's backup API, so it is safe while the app is running. `scripts/backup-offbox.sh` does the same, checks the copy, and streams it to a folder on the host for cron. Restore and the rest of the operating procedures are in [RUNBOOK.md](RUNBOOK.md).

## What it does

Two workspaces, chosen at the top of the sidebar. **Assets**, sixteen screens:

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
| Grievance detail: facts, body, files, timeline, status, owner, void, Excel workbook | `/grievances/GR-2026-0001` |
| Edit grievance (needs a reason; earlier versions are kept) | `/grievances/GR-2026-0001/edit` |
| Earlier versions | `/grievances/GR-2026-0001/versions` |
| Add an action, event or correction, with files | `/grievances/GR-2026-0001/entries/new` |
| Entry detail | `/grievances/GR-2026-0001/entries/E03` |
| Case file: print layout, saved as a PDF from the print dialog | `/grievances/GR-2026-0001/case-file` |
| Grievance categories | `/grievances/categories` |
| Grievance audit log (filter, search, CSV export) | `/grievances/audit` |

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
- The Grievance Audit Log is separate from the asset Audit Log and records every grievance change, download, print and workbook export, by ID, title and filename only, never body text. The case file prints, and the workbook downloads, only after that entry is written.
- Roles: **Admin** adds and changes records. **Super Admin** can also delete, archive employees and manage accounts.

## Project layout

```
server/            Hono API: app.ts, routes/, services/ (business rules), db/ (Drizzle schema + SQL migrations), tests/
                   plus the command-line tools backup.ts, admin.ts and seed.ts
scripts/           backup-offbox.sh (scheduled, checked backups to the host)
shared/            Types, Zod schemas, password rules, permissions, the importable record types and the CSV reader and writer, used by both sides
web/src/           React app: routes/ (file-based), components/ui (kit), components/data-grid (TanStack Table), features/ (grievances/ holds the timeline, files, rich text and chip picker pieces)
dist/web/          Built SPA (generated)
```

Node runs the server TypeScript directly (type stripping), so there is no server build step; imports use explicit `.ts` extensions and only erasable syntax. Business rules live in `server/services/*` and are covered by `server/tests/api.test.ts` and, for grievances, `server/tests/grievances.test.ts`.

## How it differs from the design spec

The design was reworked for legibility and comfort, not just restyled:

- Larger type (14px body, 12px floor), 36px controls, 56px rows, horizontal rules only, and measured contrast (the spec's greys were 1.7-2.6:1). Fully responsive down to a phone.
- The spec's Dashboard combined a metrics rail and the asset grid. Here **Overview** answers "what needs a decision" and **Physical Assets** is the register.
- The grid's live entry row became a **Quick add** panel above the table, so labels stay visible. Spreadsheet paste still adds many rows at once, after showing them for a last look.
- Issue and Return open as right-hand sheets rather than centred modals, and are still linkable.
- The design-time "viewing as" toggle is gone: the role comes from the signed-in account, and unavailable actions are shown disabled with the reason.

## Known gaps and next steps

- No logo or brand colour was supplied; the mark is a placeholder. What "BPHS" expands to is unrecorded.
- Bulk return applies one condition to every selected asset.
- No dark theme yet (the tokens are semantic, so it is additive).
- Backups and HTTPS are documented, not built in: schedule `scripts/backup-offbox.sh` and, if wanted, put a TLS proxy in front (see the runbook).
- The audit log export caps at 50,000 rows per download, and is CSV only.
- Only employees and programs can be imported. Physical and digital assets are added on their own pages (physical assets also by spreadsheet paste); each could become importable by adding one definition to `shared/importers.ts` and one creator to `server/services/imports.ts`.
- Every account can read every grievance; there is no limit to named people or an HR-only role.
- The case-file PDF comes from the browser's print dialog, so its page header and footer are the browser's.
- Grievance files live inside the database, so every backup holds all of them and backups grow with them (RUNBOOK section 4.2).
- An import takes one file of at most 2,000 rows and 5 MB, reads the first sheet of a workbook, and does not read the old `.xls` format.
