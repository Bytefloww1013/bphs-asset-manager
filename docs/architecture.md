# Architecture

BPHS-Connect is one React website, one Hono API and one SQLite database, shipped as one Docker container. Inside, the code is a **kernel** plus **modules**: each feature owns its tables, rules, API, pages, seeds, tests and docs, and the kernel finds the modules through generated registries. A new feature is one folder plus one line.

This page is the map. How to add, change or remove a module is in [docs/modules.md](modules.md); what each module does, and its rules, is in its own `README.md` (linked from the table at the end).

## Tiers

| Tier | Where | May depend on |
|---|---|---|
| Kernel | `server/`, `web/src/`, `shared/` | nothing above it: it reaches modules only through the registries |
| Foundation module | `foundation/<id>/` | the kernel and other foundation modules |
| Feature module | `modules/<id>/`, each listed in `FEATURES` (`app.modules.ts`) | the kernel, foundation modules and other feature modules' public APIs |

Every module is always installed. `FEATURES` lists the feature modules in the order the registry gives them, and that order is behaviour: it decides which module answers a hook first.

- **The kernel** is what a request can't run without: the HTTP app and its middleware, config, the database client and the one migrations folder, the module registries, the access engine and route declarations, sign-in and sessions, accounts and the Users page, Profile, the admin CLI (`server/admin.ts`), backup (`server/backup.ts`), uploads and rich text, errors, the UI kit, the data grid, the app shell (rail, pages panel, quick switcher, phone nav), the nav model, the API client, and the frameworks modules plug into: importers and exports, lookup lists, reports, jobs and seeds.
- **Foundation modules** are what every feature builds on: `employees`, `programs`, `assignments` (the custody ledger), `audit` (the central audit log) and `notifications` (notifications, notices and the Inbox).
- **Feature modules** are the workspaces: `assets`, `digital-assets`, `grievances`, `reviews`, `tasks` and `maintenance`.

Each module is `<tier>/<id>/{server,shared,web}`, plus its `README.md` and its tests next to the code. Its **public API** is `server/index.ts`, `shared/index.ts` and `web/index.ts`: the only files another module may import.

## The registry

`app.modules.ts` lists the feature modules that are on. Each module describes itself in three manifests, one per side:

- `shared/manifest.ts` (`defineSharedManifest`, contract `shared/modules.ts`): id, tier, label, `dependsOn`, `confidential`, permission resources, notification kinds, audit entity types and `routePrefix`. Plain data, so the server, the website and the scripts can all read it.
- `server/module.ts` (`defineServerModule`, contract `server/modules.ts`): its schema, routes, webhooks, jobs, startup, seed and hook answers.
- `web/module.ts` (`defineWebModule`, contract `web/src/modules.ts`): its workspaces, nav pages, slots, exports, importers, lookup-list editors and preload.

`bun run modules:gen` (`scripts/gen-modules.ts`) reads every shared manifest and writes the three registries: `shared/modules.gen.ts`, `server/modules.gen.ts` and `web/src/modules.gen.ts`. They list every module, foundation first, then `FEATURES` in its order, each after the modules it depends on. The generator refuses a feature folder `FEATURES` leaves out, an unknown or cyclic dependency, a foundation module that depends on a feature module, a confidential module with notification kinds, and an id, resource, notification kind or audit entity type declared twice. The dev server reruns it when a manifest, a `module.ts` or `app.modules.ts` changes; CI and `docs/verify/quick-check.sh` run `bun run modules:gen --check`.

The kernel reads the registries through `shared/registry.ts`, `server/registry.ts` and `web/src/registry.ts`, never the generated files directly. The server and website registries don't import the modules: each entry point installs them first with `installModules(...)` (`server/index.ts`, `server/seed.ts`, `web/src/main.tsx`, and the test setups `server/testing/setup.ts` and `web/src/test-setup.ts`). A module imports kernel code that reads the registry, so a registry that imported the modules would load them halfway through (an ESM cycle).

Pages follow the same list. `vite.config.ts` mounts each module's `web/routes/` under the app layout at its `routePrefix`, and its `web/print/` at the root, through TanStack Router's virtual file routes; the route generator writes `web/src/routeTree.gen.ts`. URLs are those of the files, as before the split.

## A request, start to finish

At start, `server/index.ts` installs the server modules, opens `DATA_DIR/bphs.sqlite`, runs every migration, runs each module's `startup` (default rows), makes the first Super Admin if there are no accounts (`server/bootstrap.ts`), starts the jobs and serves the app.

A request to the API then goes through `createApp` (`server/app.ts`):

1. **Middleware**: logging, security headers (CSP), CSRF, `Cache-Control: no-store`, and a body-size limit (an upload's route sets its own, after the session check).
2. **Open paths**: `/api/health`, sign-in (`/api/auth`), and each module's webhooks under `/api/webhooks<base>`, which check their own secret instead of a session (maintenance's Zoho webhook).
3. **Session**: everything else under `/api` needs a signed-in account (`authenticate` in `server/middleware.ts`).
4. **Routing**: each module's routers, mounted at `/api<base>` in registry order, then the kernel's own (Users, Import, lookup lists).
5. **Access**: every route's first handler is its declaration (`server/access/route.ts`): `requires(resource, level)`, `serviceDecides(resource)` (Read lets the request in and the service decides the rest), `open()` (any signed-in account) or `superAdmin()`. `createApp` throws at start if any route lacks one, and a path no route declares is answered 404: **default-deny**.
6. **Validation**: a route checks its body against the module's Zod schema (`json(schema)` from `server/http.ts`) and its path parameters (`intParam`).
7. **Service**: the module's `server/service.ts` applies its rules, in one transaction where it writes, with its audit entry and notifications in the same transaction. It talks to SQLite through Drizzle (`better-sqlite3`).
8. **Errors**: `describeError` (`server/lib/errors.ts`) turns a thrown error into `{ error, message, details }` with its status; anything else is a 500 and is logged.

In production, anything not under `/api` is the built website (`dist/web`), and an unknown address gets the app shell so the router can decide. In development Vite serves the website and passes `/api` to the server.

On the website, `web/src/main.tsx` installs the web modules and starts the router. The `_app` layout (`web/src/routes/_app.tsx`) checks the session (`requireSession` in `web/src/lib/session.ts`) and sends an account without Read in the workspace it is opening to one it can use. Pages read through React Query (each module's `web/queries.ts`) and write through `useWrite` (`web/src/lib/hooks.ts`), which refreshes every query after a write; both go through the API client (`web/src/lib/api.ts`). The rail, the pages panel, the phone nav and the quick switcher all read one nav model (`web/src/lib/nav.ts`), built from the modules' `workspaces` and `nav`.

## How modules work together

- **Public APIs**: a module imports another only through its `index.ts` files, and names it in `dependsOn`.
- **Server hooks**: questions the kernel or a foundation module asks every module (`ServerHooks` in `server/modules.ts`), such as `employee.references` ("does anything still reference this employee?") and `custody.kinds`. The asker reads every answer with `hooks('<name>')`, in registry order.
- **Web slots**: places in a page where other modules draw (`SlotProps` in `web/src/modules.ts`), such as an employee's holdings or `app.overlays`; the page draws them with `<Slot>` (`web/src/components/slot.tsx`).
- **Jobs**: work on a timer, declared by the module (`notifications.purge`, `tasks.clock`); the kernel adds its own `sessions.purge`. Each run is on its own: one that throws is logged and stops nothing else.

The hooks and slots, with examples, are in [docs/modules.md](modules.md).

## Boundaries, and what enforces them

| Rule | Enforced by |
|---|---|
| (a) Website code never imports server code. | `bun run lint`: the `boundaries/imports` rule (`scripts/oxlint-boundaries.ts`) |
| (b) A foundation module never imports a feature module. | the same rule; `modules:gen` refuses the dependency |
| (c) Code outside a module imports only its public API (`<side>/index.ts`); the generated registries may import manifests and `module.ts` files. | the same rule |
| (d) Shared code never imports server or website code. | the same rule |
| (e) A confidential module never imports `foundation/notifications`. | the same rule |
| (f) Kernel code never imports a feature module, except through the generated registries. | the same rule |
| Every feature module is listed in `FEATURES`; a dependency is declared, exists and isn't a cycle. | `modules:gen` (and `--check` in CI) |
| Grievances and Reviews never notify and never show a count. | `confidential: true` in their manifests: `modules:gen` refuses their notification kinds, rule (e) their notification imports, and a confidential workspace never has a badge |
| Every API route declares its access; nothing undeclared answers. | `createApp` refuses to start; unknown paths are 404 |
| The schema files and the migrations agree. | `docs/verify/schema-drift.sh` |
| Every module has a README with the required sections, the module table below is current, and every path a doc quotes exists. | `bun run docs:check` (`scripts/docs-check.ts`), in CI |
| A new module needs only its folder, one line in `app.modules.ts`, the generated files and one migration. | `docs/verify/new-module-proof.sh` |

The boundary rule resolves every import, `export … from` and `import()` to a repo path (relative, `#…`, `@/`, `@shared/`), so a relative path out of a module is caught as well as an alias.

Imports across folders use the package.json subpath imports (`#kernel/*` → `server/*`, `#shared/*`, `#foundation/*`, `#modules/*`), because the server runs `.ts` directly under Node type stripping and can't use Vite's aliases. Website code also has `@/` (`web/src/`) and `@shared/`.

## Permissions as resources

- A module declares **permission resources** in its shared manifest: a key, a label, the levels it offers (None, Read, Edit, Full; Tasks adds Assign), one line of help per level, and whether it is a workspace. Each account's grants are one JSON object in `users.access`, a level per resource key.
- `canAt(user, resource, level)` (`shared/permissions.ts`) is the one check, used by the route declarations, the services and the website. A Super Admin is Full in every resource, including any added later; an account not given a level is None, so a new module starts closed to everyone else.
- A resource may also be unavailable to some accounts whatever they were given (`available`: Reviews, rule R9).
- A removed module's grants can stay in `users.access`: the API leaves them out (`declaredAccess`) and a save keeps them (`keepUndeclared`), so they never block a change on the Users page.
- Splitting today's resources (one per workspace, plus Employees) into finer ones is a later change, paired with issue #21.

## Custody

Physical and digital assets are issued through one ledger, the `assignments` foundation module. Its `assignments` table holds one row per time an item was held: the item (`kind`, `item_id`), the holder (an employee or a program, never both), and issued and returned at and by, with at most one open row per item. Each asset module registers a **custody kind** through the `custody.kinds` hook (its label, the holders it allows, what blocks an issue), keeps its own pages, words and audit entries, and ships a trigger that refuses deleting an item with custody history. Asset modules depend on `assignments`, never the reverse. Migration 0024 merged the old physical and digital tables into this one; `docs/verify/migration-check.mjs` rehearses it. The details are in [foundation/assignments/README.md](../foundation/assignments/README.md).

## Data and migrations

- One SQLite file and one migrations folder (`server/db/migrations/`) for every module. drizzle-kit reads the kernel's `server/db/schema.ts` (`users`, `sessions`) and every module's `server/schema.ts` (`drizzle.config.ts`).
- Migrations run at every start, before anything is served.
- Removing a module drops its tables through a migration in the same change ([modules.md](modules.md), Remove a module).
- `bun run db:seed` (`server/seed.ts`) makes the demo data: the kernel's accounts and employees, then each module's `seed` in registry order, from one shared random sequence and clock (`SeedKit` in `server/modules.ts`).

## Modules

Written by `bun run docs:gen` (`scripts/docs-gen.ts`) from the manifests, `app.modules.ts` and each module's server and website sides; `bun run docs:check` fails when it is stale. Order is the registry's.

<!-- modules:begin (written by `bun run docs:gen`; do not edit by hand) -->

| Module | Tier | Confidential | Depends on | Permission resources | Workspaces | Jobs |
| --- | --- | --- | --- | --- | --- | --- |
| [`employees`](../foundation/employees/README.md) | foundation | - | - | `employees`: none, read, edit, full | - | - |
| [`programs`](../foundation/programs/README.md) | foundation | - | - | - | - | - |
| [`assignments`](../foundation/assignments/README.md) | foundation | - | `employees`, `programs` | - | - | - |
| [`audit`](../foundation/audit/README.md) | foundation | - | - | - | - | - |
| [`notifications`](../foundation/notifications/README.md) | foundation | - | - | - | - | `notifications.purge`, every 6 h and at start |
| [`assets`](../modules/assets/README.md) | feature | - | `employees`, `programs`, `assignments`, `audit`, `notifications` | `assets`: none, read, edit, full | `assets` (Assets) | `notifications.overdue-reminders`, every 6 h and at start |
| [`digital-assets`](../modules/digital-assets/README.md) | feature | - | `employees`, `assignments`, `audit`, `notifications`, `assets` | - | - | - |
| [`grievances`](../modules/grievances/README.md) | feature | yes | `employees`, `audit` | `grievances`: none, read, edit, full | `grievances` (Grievances) | - |
| [`maintenance`](../modules/maintenance/README.md) | feature | - | `employees`, `audit`, `notifications` | `maintenance`: none, read, edit, full | `maintenance` (Maintenance) | - |
| [`reviews`](../modules/reviews/README.md) | feature | yes | `employees`, `audit` | `reviews`: none, read, edit, full | `reviews` (Reviews) | - |
| [`tasks`](../modules/tasks/README.md) | feature | - | `notifications` | `tasks`: none, read, assign, edit, full | `tasks` (Tasks) | `tasks.clock`, every 1 min |

<!-- modules:end -->
