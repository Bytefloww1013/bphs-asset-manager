# BPHS-Connect

<img src="web/public/brand/brightpath-header.svg" alt="Brightpath Human Services" width="280" height="83" />

Application: [BPHS-Connect](https://bphs-connect.com).

An internal register of company IT equipment: what exists, who holds it, since when, and what condition it was in at every handoff. Behind the same sign-in, a second workspace, the **Grievance Tracker**, keeps employee grievances with a timeline that is only ever added to, a third, **Maintenance**, tracks the work order requests staff send from a Zoho form, a fourth, **Administrative Reviews**, keeps reviews of employees' work and the corrective action plans (CAPs) that follow from them, each hidden from the employee it is about, and a fifth, **Employee Tasks**, assigns tasks to accounts, which each person completes in their own Home. One TypeScript codebase: a React single-page app and a small API over a SQLite file, shipped as a single Docker container. The code is a small kernel plus modules: each workspace is a feature module, listed in `app.modules.ts` (see [Project layout](#project-layout)).

- **Front end:** React 19, Vite, Tailwind v4, TanStack Router, Query, Table (v9) and Form, Radix primitives, Lucide icons, Geist type (self-hosted).
- **Back end:** Hono on Node 24+, Drizzle ORM over `better-sqlite3`, Zod validation, scrypt password hashing, cookie sessions stored in SQLite.
- **No Django, no external services.** It runs on a remote VPS at [bphs-connect.com](https://bphs-connect.com), behind Nginx with HTTPS. The only traffic from outside is the optional Zoho Forms webhook that delivers Maintenance requests. The app itself makes no outbound calls.

The design system lives in [DESIGN.md](DESIGN.md) and the product brief in [PRODUCT.md](PRODUCT.md). **Setting up the VPS and deploying updates:** [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md). **Running it in production** (backups, restore, upgrades, account recovery, HTTPS, troubleshooting): [RUNBOOK.md](RUNBOOK.md). **How the code is built:** [docs/architecture.md](docs/architecture.md). **Adding or changing a module:** [docs/modules.md](docs/modules.md).

## Run it locally

Requires [Bun](https://bun.sh) 1.3 or newer (package manager and script runner) and Node 24 or newer (what the app actually runs on).

```bash
bun install
bun run db:seed        # optional: synthetic demo data (24 employees, 6 programs, 116 physical assets, 32 digital assets, 5 grievances, 5 administrative reviews, 9 tasks, history, 6 users)
bun run dev            # API on :3000, app on http://localhost:5173
```

The seed prints the demo sign-ins (a Super Admin, an account with Edit access, a read-only account; it also makes one that must change its password, a locked one and a deactivated one). One of the reviews is about the Edit account's own employee, to show it is hidden from that account. It makes the employees and accounts, then runs each module's own `seed`, in registry order. It refuses to run when `NODE_ENV=production` or when the database already has users (`bun run db:seed --reset` deletes the database file first). Without seeding, the first start creates one Super Admin with the password `Brightpath1!`, which must be changed at first sign-in.

The development API runs on Node through `tsx watch`, which restarts it when an imported file changes. This avoids the native file-watcher crash seen with Node 24's `--watch` mode when stopping the server. The Vite dev server also reruns `bun run modules:gen` when `app.modules.ts` or a module's manifest changes.

Other scripts:

| Script | What it does |
| --- | --- |
| `bun run test` | Every test (Vitest): each module's, next to its code, and the kernel's. Most are API integration tests against an in-memory database (sign-in and lockout, route access, the custody ledger, imports, audit, notifications, and each workspace's rules, files and confidentiality); the rest are unit tests. `bunx vitest run <path>` runs one file |
| `bun run typecheck` | Strict TypeScript for the website (`web/tsconfig.json`) and the server (`server/tsconfig.json`), each covering its side of the kernel and of every module, shared code included |
| `bun run build` | Builds the SPA to `dist/web` |
| `bun run start` | Production mode: builds the SPA first, so it is never an older one, then the API serves it from `dist/web` |
| `bun run modules:gen` | Rewrites the generated module registries (`shared/modules.gen.ts`, `server/modules.gen.ts`, `web/src/modules.gen.ts`) from `app.modules.ts` and the module manifests. `--check` writes nothing and fails when one is stale (CI runs it) |
| `bun run new-module <id>` | Scaffolds a feature module in `modules/<id>/` from `scripts/templates/module/` and adds it to `FEATURES`; `--foundation` makes a foundation module instead. See [docs/modules.md](docs/modules.md) |
| `bun run docs:gen` | Writes the module table in [docs/architecture.md](docs/architecture.md) from the manifests |
| `bun run docs:check` | Fails when a doc has gone stale: a module without its README or one of its required sections, a module table `docs:gen` would change, or a repo path quoted in Markdown that no longer exists (CI runs it) |
| `bun run db:generate` | Generate a new SQL migration (Drizzle Kit) from every schema: the kernel's `server/db/schema.ts` and each module's `server/schema.ts` (`drizzle.config.ts`). All of them share one migrations folder, `server/db/migrations` |
| `bun run db:backup` | Safe online backup of the SQLite file |
| `bun run admin <command>` | Break-glass account recovery: `list`, `unlock <email>`, `reset-password <email>` (see the runbook) |

Bun only installs packages and runs these scripts; every script still executes on Node, because `better-sqlite3` is a native addon that Bun's runtime cannot load. Use `bun run test`, not `bun test`: the latter is Bun's own test runner, not Vitest. Commit `bun.lock`, and commit the generated registries with the change that made them.

### Formatting

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats the code (settings in `.oxfmtrc.json`). Run `bun run format` before you push: CI runs `bun run format:check` and fails on any unformatted file. For format-on-save, install the Oxc editor extension (see the Oxfmt docs above). Markdown, `docs/` and generated files (`web/src/routeTree.gen.ts`, the `modules.gen.ts` registries, Drizzle migrations) are not formatted.

### Linting

[Oxlint](https://oxc.rs/docs/guide/usage/linter) lints the code with type information (`--type-aware`, through `oxlint-tsgolint`; rules in `.oxlintrc.json`). Run `bun run lint` before you push: CI runs it and fails on any error or warning, with each finding shown on the PR. `bun run lint:fix` applies the safe fixes. The Oxc editor extension also shows the findings as you type. The route tree, the migrations and `docs/` are not linted.

The module boundaries are one rule, `boundaries/imports`, from an in-repo JS plugin, `scripts/oxlint-boundaries.ts`, loaded through `jsPlugins` in `.oxlintrc.json` (so no extra dependency). It resolves every import, `export … from` and `import()` to a repo path first, so a relative path out of a module is caught as well as a `#…` or `@/` one. It refuses:

- (a) web code importing server code;
- (b) a foundation module importing a feature module;
- (c) code outside a module importing anything of it but its public API (`<side>/index.ts`); only the generated registries may import a module's manifest and `module.ts` files;
- (d) shared code importing server or web code;
- (e) a confidential module (`confidential: true` in its manifest: Grievances and Reviews) importing `foundation/notifications`;
- (f) kernel code (`server/`, `web/`, `shared/`) importing a feature module, except through the generated registries.

[docs/modules.md](docs/modules.md) says what to do instead: go through the other module's public API, or answer one of its hooks.

### Checks

`docs/verify/quick-check.sh` runs format, `modules:gen --check`, lint, typecheck and test in one go, one PASS/FAIL line each.

For browser checks, `docs/verify/scratch-server.sh start|stop` runs a freshly seeded build on :3388 (its data under `$BPHS_TMP/bphs-qa-tasks`, or `ROOT`; never the real `DATA_DIR`). `node docs/verify/routes-smoke.mjs` opens every route in the route tree as a Super Admin and as an Admin in headless Chrome, against a scratch server of its own (`CHROME` names the browser); CI runs it after the build. `node docs/verify/hidden-smoke.mjs` opens every route as Marcus and as a read-only account it makes, and fails on a control shown disabled for missing access; `docs/verify/no-permission-disabled.sh` fails on web code that turns a permission into a disabled reason ([#27](https://github.com/Bytefloww1013/bphs-asset-manager/issues/27)). `node docs/verify/tasks-smoke.mjs` drives the scratch server in headless Firefox: a task is assigned, shows on the assignee's bell, and is marked complete. It installs its own puppeteer-core outside the repo, in `$BPHS_TMP/bphs-qa-tools`; `FIREFOX` overrides `/snap/bin/firefox`. Every `docs/verify` script keeps its scratch files and logs in `BPHS_TMP` (default `$TMPDIR`, else `/tmp`); snap Firefox can't read `/tmp`, so set it to a folder under your home for the Firefox smokes.

## Deploy

Production runs on an Ubuntu VPS with this stack:

```text
Browser → bphs-connect.com:443 → Nginx → 127.0.0.1:8080 → app container:3000
```

- **HTTPS:** Nginx terminates TLS with a Let's Encrypt certificate from Certbot, which renews it automatically.
- **Port:** the container listens only on `127.0.0.1`, so it is not reachable from outside except through Nginx.
- **Compose file:** production uses its own Compose file, `/etc/bphs-connect/compose.yml` on the VPS, kept outside the checkout. The repository's `docker-compose.yml` is not used there.
- **Data:** the database lives in the `bphs-connect-data` volume.

[DEPLOY-GUIDE.md](DEPLOY-GUIDE.md) covers the whole setup, from DNS to the firewall, Docker, Nginx, HTTPS, backups and the Zoho webhook. Step 13 is the routine for shipping an update: back up, `git pull`, rebuild, check `/api/health`. Migrations run automatically on start.

To try the container on your own machine, use the repository's `docker-compose.yml`:

```bash
docker compose up -d --build
docker compose logs assets      # first run: shows the Super Admin email and starting password
```

Then open `http://localhost:8080`, sign in with the starting password `Brightpath1!`, and choose a new one when asked. The database lives in the `bphs-data` volume at `/data/bphs.sqlite`.

Configuration (environment variables, set in the Compose file):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container |
| `DATA_DIR` | `/data` | Where `bphs.sqlite` lives. Keep it on a local disk, not a network share (SQLite WAL) |
| `COOKIE_SECURE` | `false` | `true` in production, which is served over HTTPS. Leave it `false` for plain HTTP, such as a local try-out: there a Secure cookie is never stored and nobody can sign in |
| `SESSION_IDLE_HOURS` | `12` | Idle time before a session expires. A whole number of hours, 1 or more; the server will not start with anything else. A sign-in with "Keep me signed in" ticked lasts 30 idle days instead, with a cookie that survives closing the browser; untick it and the cookie ends with the browser |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` | `admin@bphs.local`, `Super Admin` | Used once, when the database has no users |
| `MAINTENANCE_WEBHOOK_SECRET` | unset | The shared secret Zoho Forms sends in the `X-Webhook-Secret` header with each maintenance request. Unset, the webhook answers 404 and requests can only be entered by hand. At least 32 characters (`openssl rand -hex 32`); the server will not start with a shorter one. Setup: DEPLOY-GUIDE step 15 |

### Backups

On the VPS:

```bash
sudo docker compose -f /etc/bphs-connect/compose.yml exec assets node server/backup.ts   # writes /data/backups/bphs-<timestamp>.sqlite
```

This uses SQLite's backup API, so it is safe while the app is running. `scripts/backup-offbox.sh` does the same, checks the copy, and streams it to a folder on the host. It runs nightly from cron and also sends an encrypted copy to Google Drive through rclone (DEPLOY-GUIDE step 12). Restore and the rest of the operating procedures are in [RUNBOOK.md](RUNBOOK.md). There, use `sudo docker compose -f /etc/bphs-connect/compose.yml` in place of `docker compose`.

## What it does

Five workspaces, each picked in the rail on the left (under "More" when they do not all fit), with its pages in the panel beside it. Each workspace belongs to the feature module named beside its heading, whose `web/routes/` holds its pages. Assets and Home also show pages from the kernel and the foundation modules, so their tables say whose each page is. Ctrl K / ⌘ K opens "Jump to…" for any page; on a phone, the menu button opens a drawer with "All workspaces" a level up. **Assets** (`modules/assets`, with `modules/digital-assets`), sixteen screens:

| Screen | Route | Code |
| --- | --- | --- |
| Sign in | `/login` | kernel |
| Forced password change | `/password-change` | kernel |
| Overview (inventory, out the longest, condition watch, free stock, activity) | `/` | `modules/assets` |
| Physical Assets register (Type, Brand, Model, Entra ObjectId, Serial) with quick-add and spreadsheet paste | `/assets` | `modules/assets` |
| Asset detail with assignment and condition history | `/assets/BPHS-0102` | `modules/assets` |
| Active assignments with bulk return | `/assignments` | `modules/assets` |
| Available assets, with an `I` shortcut to issue | `/available` | `modules/assets` |
| Issue an asset (sheet) | any page, `?issue=<assetId>` or `?issue=new` | `modules/assets` (the `app.overlays` slot) |
| Return an asset (sheet, with the race-conflict state) | any page, `?return=<assignmentId>` | `modules/assets` (the `app.overlays` slot) |
| Digital Assets: license and account seats, one per row, issued to employees | `/digital-assets` | `modules/digital-assets` |
| Employees with quick-add | `/employees` | `foundation/employees` |
| Programs, which can hold physical assets the way an employee does | `/programs` | `foundation/programs` |
| Lists: asset types, asset brands, digital asset types and condition ratings | `/lists` | kernel, with each list from a module's `lists` hook |
| Import/Export: employees and programs in from CSV or Excel (map columns, preview, then commit); every list out as CSV or Excel | `/import-export` | kernel, with the importers and exports the modules register |
| Audit log (filter, search, CSV export) | `/audit` | `foundation/audit` |
| Users (Super Admin only) | `/users` | kernel |

**Grievances** (`modules/grievances`), eleven screens:

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
| Employees (for accounts with Employees access) | `/grievances/employees` |
| Grievance categories | `/grievances/categories` |
| Grievance audit log (filter, search, CSV export) | `/grievances/audit` |

**Maintenance** (`modules/maintenance`), three screens:

| Screen | Route |
| --- | --- |
| Requests: Open, Finished, Rejected and All tabs, search | `/maintenance` |
| New request, for one that did not come through Zoho | `/maintenance/new` |
| Request detail: facts, description, who it is dispatched to, status, notes timeline, delete | `/maintenance/1` |

Requests sent from the Zoho form arrive at `POST /api/webhooks/maintenance` (`modules/maintenance/server/webhook.ts`).

**Administrative Reviews** (`modules/reviews`), twelve screens:

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
| Employees (for accounts with Employees access) | `/reviews/employees` |
| Review audit log (filter, search, CSV export) | `/reviews/audit` |

**Employee Tasks** (`modules/tasks`), four screens:

| Screen | Route |
| --- | --- |
| All tasks: a tab per status, assignee and assigner filters | `/tasks` |
| Assign a task to one or more accounts, now or at a set time, with files | `/tasks/new` |
| Task detail: facts, body, files, history, approve, send back, cancel, delete | `/tasks/1` |
| Edit task | `/tasks/1/edit` |

**Home**, the signed-in person's own pages, first in the rail. Every account has it, whatever its access. It is not a workspace: workspaces are shared work areas that access is granted to. Its panel starts with a greyed-out My Dashboard entry marked "Coming later" ([#14](https://github.com/Bytefloww1013/bphs-asset-manager/issues/14)).

| Screen | Route | Code |
| --- | --- | --- |
| Inbox: Unread, All and Archived; mark read or unread, or archive | `/me/inbox` (`/me` opens it) | `foundation/notifications` |
| A notice in full (opening it marks it read) | `/me/inbox/1` | `foundation/notifications` |
| My tasks: Open and Completed, with a switch to show cancelled ones | `/me/tasks` | `modules/tasks` |
| A task: body, files, history, Mark complete (with a note and files) | `/me/tasks/1` | `modules/tasks` |
| Profile: name, email, linked employee, access in each section (read-only) | `/me/profile` | kernel |
| Notices (Super Admins only): send one to everyone or to picked accounts, and see "n of m read" for each sent | `/me/notices` | `foundation/notifications` |

**Notifications** (`foundation/notifications`) are in-app only, never email. Each module sends its own through `notify()` and declares their kinds in its manifest. A bell with a red count of unread ones sits in the rail and the phone top bar; it opens the latest eight, with Mark all read and See all. The count is fetched every 30 seconds and when the tab regains focus. An account is notified when an asset or digital asset is issued to its employee, when an asset it holds goes overdue (once), when a maintenance request is dispatched to it, taken from it, changes status or gets a note, when a task is assigned to it, changed, cancelled, approved, sent back or past due, when a task it assigned is completed, waits for its approval or goes past due, and when its own account changes (password reset, access, unlock, employee link). The Assets team (Edit or Full, plus Super Admins) is told of returns in poor condition, one notification per bulk return. Your own actions never notify you, deactivated accounts and imports get nothing, and **Grievances and Administrative Reviews never notify anyone**: a notification would show that a case exists. Both are `confidential` modules, so `bun run modules:gen` refuses any notification kind they declare and lint rule (e) any import of the notifications module. Notifications and notices over a year old are deleted every 6 hours and at start (the `notifications.purge` job); the overdue reminders are the assets module's own 6-hourly job, and the kernel purges expired sessions on the same beat. The task clock (`tasks.clock`, in `modules/tasks`) runs every minute: it delivers scheduled tasks when their send time comes, tells the assigner when a task goes past due, and sends the reminders. A job that fails is logged and stops neither the others nor the server.

### Rules the system enforces

Each rule ends with the code that owns it: the kernel, or a module folder whose README has the details.

- Every API route declares what it needs as its first handler (`server/access/route.ts`): `requires(resource, level)`; `serviceDecides(resource)`, where Read lets the request in and the service decides the rest (an owner, a reviewer, an assigner); `open()`, any signed-in account; or `superAdmin()`. The server will not start while a route declares nothing, and a path no route declares is refused with a 404 (default-deny). Only `/api/health`, the sign-in routes (`/api/auth`) and the webhooks (`/api/webhooks`, which check their own secret) are mounted outside this check. (kernel)
- Access: each account has a level in each of Assets, Grievances, Maintenance, Administrative Reviews, Employee Tasks and Employees, the permission resources the modules declare in their manifests. **None** hides the section, **Read Only** sees it, **Assign** (Employee Tasks only) also assigns tasks and changes or cancels its own, **Edit** also adds and changes records, **Full** also deletes, archives, voids and withdraws. **Super Admin** is Full everywhere, including sections added later, and is the only way to manage accounts. An account given no level in a resource is None there, so a new module starts closed to everyone but Super Admins. Employees are shared: every account can choose them in a form, Employees None only hides the Employees page, and each workspace shows only its own counts. Every account sees its own tasks in Home, whatever its Tasks level. (kernel, with each module's resource in its `shared/manifest.ts`)
- Five wrong passwords lock an account for 15 minutes. New and reset accounts get a one-time password and must change it before any other page works (the API refuses everything else until then). (kernel)
- An import only adds employees and programs. It never changes an existing record and never issues anything; a row whose ID already exists is skipped, so running the same file twice is safe. Each record created gets its own audit entry. (kernel, with the importers from `foundation/employees` and `foundation/programs`)
- An asset or digital asset has at most one open assignment, in the app **and** by a partial unique index on the custody ledger (`uq_assignments_one_open_per_item`). Each assignment's holder is exactly one employee or one program, never both and never neither, in the app **and** by a `CHECK` constraint (`ck_assignments_one_holder`). A digital asset goes to employees only. (`foundation/assignments`)
- Records with history are never deleted: a physical asset is retired, a digital asset made inactive, an employee archived, a program deactivated. Delete needs Full in that section (Assets for programs and digital assets) and works only for records with no history. Database triggers also refuse deleting an asset or digital asset that has ever been held. (`foundation/assignments` and each record's own module)
- The audit log is append-only. SQLite triggers reject any `UPDATE` or `DELETE` on it, and `writeAudit()` refuses an entity type no module declares. (`foundation/audit`)
- Every issue and return of a physical asset records a condition snapshot (rating, assessor, notes). A handoff is a return then an issue. A retired asset can't be issued, and an assigned one can't be retired. (`modules/assets`)
- A digital asset gets its Asset ID from the system (`DA-00001`, never typed, edited or reused), is issued to employees only, and reads Active while someone has it. Its License/Account field names a seat and refuses anything that labels itself a password, key or token: no credential is stored. (`modules/digital-assets`)
- A grievance gets its ID from the system (`GR-2026-0001`), and each entry on its timeline one of its own (`GR-2026-0001-E01`). Entries, earlier versions and file contents are never changed or deleted, in the app **and** by triggers in the database; a mistake is fixed by a correction entry linked to it. Status changes, new owners, edits and files add automatic entries. (`modules/grievances`)
- Only the owner's account (with Read Only or more) or Grievances Edit can edit a grievance, change its status or give it a new owner; voiding a grievance and withdrawing a file need Grievances Full. A Closed or Voided grievance takes no new entries or files, and a Closed one must be reopened before it is edited. An edit made from an older version than the one saved is refused. (`modules/grievances`)
- Grievance files: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, checked by content, up to 10 MB each and 10 at a time, stored inside the database. Downloads are always a file to save, never shown in the page. (the kernel's uploads, `server/lib/uploads.ts`)
- The Grievance Audit Log is separate from the asset Audit Log and records every grievance change, download and print, by ID, title and filename only, never body text. The case file prints only after that entry is written. (`modules/grievances`)
- A maintenance request gets its ID from the system (`MR-0001`) and starts Not Started. Choosing an employee dispatches it; clearing the employee on a Dispatched request returns it to Not Started. Statuses are Not Started, Dispatched, On Hold, Rejected and Finished. Every dispatch, status change and note adds a line to its timeline, and a delete (Maintenance Full, after a confirmation) is recorded in the Audit Log by ID only. An employee dispatched on a request can be archived but not deleted. (`modules/maintenance`)
- The webhook needs the shared secret in `X-Webhook-Secret` and a non-empty `description`; every other field may be missing, over-long text is cut rather than refused (Zoho does not retry), and the same entry sent twice (same email and Added Time) is stored once. (`modules/maintenance`)
- A review gets its ID from the system (`AR-2026-0001`), each CAP a number within it (`CAP01`), and each entry on its history one of its own (`E01`). Entries and file contents are never changed or deleted, in the app **and** by triggers in the database; a mistaken update is fixed by a correction, a CAP added by mistake is cancelled with a reason, and a review entered by mistake is voided. Every change to the review or a CAP adds an automatic entry. (`modules/reviews`)
- A review is never shown to the account linked to its employee reviewed, whatever its level, Super Admin included: it is left out of every list, count, search, export and audit entry, and its address answers 404. So every account is linked to an employee (except the first account), and nobody can change their own account's link. (`modules/reviews`; the link rules are the kernel's)
- The reviewer's account can manage the review with Read Only, as an owner can a grievance; Reviews Edit can manage any review. Voiding a review and withdrawing a file need Reviews Full. A review is Completed only when every CAP is Completed or Cancelled, and then takes no new CAPs, updates or files until it is reopened; a voided one never does. Review files follow the grievance file rules, and the Review Audit Log is a third log, kept apart from the other two. (`modules/reviews`)
- Grievances and Administrative Reviews never notify anyone, show no counts and write nothing to the Audit Log. (`confidential` in their manifests: `bun run modules:gen` refuses their notification kinds and audit entity types, lint rule (e) any import of `foundation/notifications`, and the rail never gives them a badge)
- A task assigned to several accounts becomes one task each, with its own copy of the files (at most 200 MB in all). Its status is worked out, never stored: Scheduled until its send time, then Outstanding, Past-Due after its due time, Awaiting Approval once completed if it needs approval, then Completed; or Cancelled. A task needing approval is approved by its assigner or Tasks Edit, never its assignee, and a task you assign yourself cannot need it. Its send time cannot be in the past and is fixed once sent. A task can require a file before it is marked complete. Tasks Edit can change or cancel any task except one a Super Admin assigned, which needs Tasks Full. Cancel keeps the task (its assignee sees it under Show cancelled); delete (Tasks Full) removes it with its history, files and notifications. Withdrawn files keep their contents but can no longer be downloaded. Tasks write to no audit log, only their own history. (`modules/tasks`)
- Reminders go out on the task's reminder days (weekdays unless changed) at its reminder time, 09:00 unless changed, in the assigner's time zone, while it is past due. A reminder day missed while the server was down is skipped, not sent late. (`modules/tasks`, the `tasks.clock` job)

## Project layout

The app is a kernel plus modules. The kernel is what a request can't run without; each module owns its tables, rules, API, pages, seed, tests and README. [docs/architecture.md](docs/architecture.md) describes the architecture, and [docs/modules.md](docs/modules.md) says how to add, change or remove a module and which import rules each kind of code follows.

```
app.modules.ts       FEATURES: every feature module, in registry order (modules:gen refuses one it leaves out)
server/              Kernel API: app.ts (assembly, default-deny), access/route.ts (route declarations), registry.ts and
                     modules.ts (the server module contract: routes, webhooks, jobs, hooks, seed), db/ (client, the users
                     and sessions tables, and the one migrations folder for every module), routes/ and services/
                     (sign-in, users, import, lookup lists), lib/ (errors, uploads, rich text), testing/ (the test kit),
                     tests/ (kernel tests across modules), and the command-line tools backup.ts, admin.ts and seed.ts
shared/              Kernel code both sides use: modules.ts (the manifest contract), registry.ts, access levels and
                     permissions, password rules, the importer framework, the CSV reader and writer, dates, rich text
web/src/             Kernel website: routes/ (sign-in, the app layout, Home and Profile, Users, Lists, Import/Export),
                     components/ (ui kit, data-grid, shell, records: the timeline, files and printout Grievances and
                     Reviews share), lib/ (API client, session, nav model), modules.ts (the web module contract, slots)
foundation/<name>/   Always-on modules: employees, programs, assignments (the custody ledger), audit, notifications
modules/<name>/      Feature modules, each on while app.modules.ts lists it: assets, digital-assets, grievances,
                     reviews, tasks, maintenance
*/modules.gen.ts     The generated registries (shared/, server/, web/src/): written by `bun run modules:gen`, never by hand
scripts/             gen-modules.ts (modules:gen), new-module.ts and templates/module/ (new-module), docs-gen.ts and
                     docs-check.ts (docs:gen, docs:check), oxlint-boundaries.ts (the boundary lint rule), backup-offbox.sh
                     (scheduled, checked backups to the host)
docs/                modules.md (the module guide), architecture.md, verify/ (scratch server, smokes and checks)
dist/web/            Built SPA (generated)
```

A module's folder looks like this; a side it doesn't need is left out (`assignments` has no website side):

```
<tier>/<name>/
  README.md          Tables, Resources and rules, Hooks, Public API, Pages, Gotchas (docs:check requires them)
  shared/            manifest.ts (id, dependencies, resources, notification kinds, audit types), index.ts (public API)
  server/            module.ts (routes, jobs, hooks, seed), schema.ts (its tables), index.ts (public API), its services
                     and its tests (*.test.ts)
  web/               module.ts (workspaces, nav, slots, exports, importers, lists), index.ts (public API), queries.ts,
                     api.ts, routes/ (its pages, mounted at the manifest's routePrefix)
```

Another module may import only its public API, the `index.ts` of each side; questions every module must answer (does anything still reference this employee? what kinds of item can be issued?) go through hooks, and pages that other modules draw into through slots.

Node runs the server TypeScript directly (type stripping), so there is no server build step; imports use explicit `.ts` extensions and only erasable syntax. Across folders the server uses the package.json subpath imports (`#kernel/…`, `#shared/…`, `#foundation/…`, `#modules/…`), because it can't use Vite's `@/` alias; the website uses `@/` and `@shared/`. Business rules live in each module's `server/` and are covered by the tests next to them, such as `modules/grievances/server/grievances.test.ts`, `modules/maintenance/server/maintenance.test.ts`, `modules/reviews/server/reviews.test.ts` and `modules/tasks/server/tasks.test.ts`. They build on the kernel's test kit, `server/testing/index.ts` (`setup()`: an in-memory database with every migration, the modules started, and signed-in callers). `server/tests/` keeps only the kernel's tests that cross modules: access, the admin CLI, the API and notification events.

## How it differs from the design spec

The design was reworked for legibility and comfort, not just restyled:

- Larger type (14px body, 12px floor), 36px controls, 56px rows, horizontal rules only, and measured contrast (the spec's greys were 1.7-2.6:1). Fully responsive down to a phone.
- The spec's Dashboard combined a metrics rail and the asset grid. Here **Overview** answers "what needs a decision" and **Physical Assets** is the register.
- The grid's live entry row became a **Quick add** panel above the table, so labels stay visible. Spreadsheet paste still adds many rows at once, after showing them for a last look. Its columns are tag, type, brand, model, Entra ObjectId, serial, condition, holder.
- Issue and Return open as right-hand sheets rather than centred modals, and are still linkable.
- The design-time "viewing as" toggle is gone: access comes from the signed-in account, and what it doesn't allow is not drawn: a page, tab or control its access doesn't allow is left out, and such a page reached by its address is not found ([#27](https://github.com/Bytefloww1013/bphs-asset-manager/issues/27)). Disabled with the reason is kept for an allowed action a record rule blocks, and for a page not built yet.

## Known gaps and next steps

- Supplied Brightpath artwork, clean SVG logos, browser icons, the desktop login hero, and the measured navy palette were recorded in BRAND-UPDATE.md, with per-phase rollback; it has since been removed and is in git history before commit `1a562fe`. Official vector originals and an exact corporate color specification remain welcome.
- Bulk return applies one condition to every selected asset.
- No dark theme yet (the tokens are semantic, so it is additive).
- HTTPS and scheduled backups live on the VPS (Nginx with Certbot, and a cron job running `scripts/backup-offbox.sh`), not in the container, so a fresh server needs DEPLOY-GUIDE followed again.
- The audit log export caps at 50,000 rows per download, and is CSV only.
- Entra ObjectId is stored only: nothing syncs it with Entra or Microsoft Graph.
- Only employees and programs can be imported. Physical and digital assets are added on their own pages (physical assets also by spreadsheet paste); each could become importable by its module registering an importer (an `Importer`, from `shared/importers.ts`) twice, with its store through the server's `importers` hook and on the website through `importers` in its `web/module.ts`, as `foundation/employees` does.
- Every account that works in Grievances can read every grievance, and every account in Administrative Reviews every review except one about itself; there is no limit to named people.
- Review due dates are recorded but nothing is flagged overdue. Reviews and grievances send no notifications at all, on purpose.
- Notifications are in-app only: no email, and nothing is pushed live (the bell checks every 30 seconds). Notices cannot be edited or withdrawn once sent.
- The grievance and review case-file PDFs come from the browser's print dialog, so its page header and footer are the browser's.
- Grievance, review and task files live inside the database, so every backup holds all of them and backups grow with them (RUNBOOK section 4.2). A task's files are copied once per assignee.
- Tasks have no export, no recurring tasks and no email; reminders are in-app like every other notification.
- Zoho Forms does not retry a webhook. A request sent while the app is down never arrives; it is still in the form's Entries in Zoho, and can be entered by hand (RUNBOOK section 9).
- Maintenance dates (Date, Noticed, Submitted in Zoho) are kept as the text Zoho sends, so they are shown but not sorted or filtered as dates.
- An import takes one file of at most 2,000 rows and 5 MB, reads the first sheet of a workbook, and does not read the old `.xls` format.
