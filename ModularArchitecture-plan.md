# Modular architecture - Implementation

Status: in progress | Started: 2026-10-23 | Issue: [#23](https://github.com/Bytefloww1013/bphs-asset-manager/issues/23) | Branch: `refactor/issue23-modular-architecture` | Delivery: one branch, one squash-merged PR, one production deploy

## Why

BPHS-Connect is one React website, one Hono API and one SQLite database in one Docker container. The server is cleanly layered (route → service → database) and well tested, but every feature's code is spread across shared central files:

- One schema file holds every table (`server/db/schema.ts`), and three big `shared/` files hold every input check, data shape and label (`schemas.ts`, `types.ts`, `constants.ts`).
- Several files list the features by hand: route mounting, the access check and upload paths in `server/app.ts`, the workspace list in `shared/constants.ts`, the URL map in `web/src/lib/workspace.ts`, the nav model, about 45 data requests in `web/src/lib/queries.ts`, the importers, the exports and the lookup lists.
- Features reach into each other: deleting an employee counts rows in other features' tables, and Assets and Digital assets each carry their own copy of issue/return logic.
- **Security gap:** `accessNeeded()` in `server/app.ts` ends with `return at('assets')`, so any API path it doesn't recognise is checked against Assets access instead of being refused.

Today, adding a workspace means editing 12–15 central files. The app is going to keep growing, and production holds little data (employees, a few grievances, about 20 maintenance records), so this is the cheapest point there will be to change the architecture.

**Goal:** a new feature is **one folder plus one line**. Every feature owns its tables, rules, API, pages, seeds, tests and docs. The kernel refuses anything that isn't declared, and the boundaries are enforced by tooling, not by memory.

## Leading words

- **kernel**: `server/`, `web/`, `shared/`, holding what a request can't run without (HTTP app, database client and migrations, module registry, access engine, sign-in, sessions, users and Profile, app shell, UI kit, and the frameworks modules plug into).
- **foundation module**: `foundation/<name>/`, always installed. Any module may depend on it, and it never imports a feature module.
- **feature module**: `modules/<name>/`, always installed and listed in `app.modules.ts`, which sets its order (switchable until 17.2a). It may depend on foundation modules and on other feature modules' public APIs.
- **manifest**: what a module tells the kernel it provides, one per side (`shared/manifest.ts`, `server/module.ts`, `web/module.ts`).
- **registry**: the generated, typed lists of loaded modules (`*/modules.gen.ts`), built from the folders and `app.modules.ts`.
- **public API**: a module's `server/index.ts`, `shared/index.ts` and `web/index.ts`, the only files another module may import.
- **hook / slot**: an extension point modules contribute to. A hook is logic (e.g. "does anything reference this employee?"). A slot is a place in the UI (e.g. the employee page's held items).
- **permission resource**: something access is granted on, declared by a module with its label and allowed levels. It starts as today's sections.
- **custody kind**: a kind of item that can be issued to a holder (physical asset, digital asset), registered with the Assignments foundation module.
- **default-deny**: an API path no route has declared is refused.
- **behaviour-neutral**: same URLs, screens, API responses, access and notifications as before.
- **disjoint file ownership**: subagents working at the same time never touch the same files.

## Decisions

Agreed with the user on 2026-10-23 (byte-gh-do-issue grilling), on top of the design decisions below:

- **Task:** split the app into kernel, foundation modules and feature modules with generated registries, default-deny route access and a custody ledger, behaviour-neutral (see Why and Out of scope).
- **Guardrails:** see Guardrails. **Definition of Done:** see Definition of Done (scripted and manual).
- **Branch:** `refactor/issue23-modular-architecture` from `origin/main` at 944638a (upstream unset, so a bare `git push` can't reach `main`).
- **One plan:** this file is the only plan. It is committed on the branch with each phase's boxes ticked; there is no separate working copy.
- **Check-ins:** stop for the user after Phase 1 (spike results), before Phase 7 (custody migration) and before opening the PR, plus any important question or approval gate. Otherwise run phase after phase.
- **Route smoke in CI:** `puppeteer-core` becomes a devDependency (no install script, so `trustedDependencies` is unchanged). CI installs Chrome with `npx @puppeteer/browsers install chrome@stable`. The Chrome path (`CHROME`) and the scratch server folder (`ROOT` in `scratch-server.sh`) become env vars that default to today's local paths.
- **No real-data rehearsal (user's choice):** 7.5 and 17.2 rehearse on a seeded database plus a production-shaped fixture, checked by `docs/verify/migration-check.mjs`. `RUNBOOK.md` tells the deployer to run that check against the pre-deploy backup.
- **Layout**
  - One folder per module: `<tier>/<name>/{server,shared,web}`, plus its `README.md` and tests next to the code.
  - Kernel code stays in `server/`, `web/`, `shared/`.
  - Imports across folders use package.json subpath imports (`#kernel/…`, `#shared/…`, `#foundation/…`, `#modules/…`), because the server runs `.ts` directly under Node and can't use Vite aliases. Website code keeps `@/`.
  - Proven in spike 1.3: the map `#kernel/*` → `./server/*`, `#shared/*` → `./shared/*`, `#foundation/*` → `./foundation/*`, `#modules/*` → `./modules/*` resolves under `node` (type stripping), `tsx` and `tsx watch` (which restarts when a module file changes), Vitest, the Vite build and dev server, `tsc` for both tsconfigs (NodeNext and bundler), and the Docker image on Node 24. Type-aware Oxlint sees the real types through it. The web bundle gets only web and shared code.
  - What that takes: the tsconfig `include` lists gain `../foundation/*/server`, `../foundation/*/shared`, `../modules/*/server` and `../modules/*/shared` (server), and the same with `web` in place of `server` (web). Vitest's include gains `{foundation,modules}/*/{server,shared,web}/**/*.test.ts`. The Dockerfile's runtime stage copies `foundation/` and `modules/`.
- **Tiers and placement**

  | Tier | Contents |
  |---|---|
  | Kernel | app/HTTP/middleware, config, db client, the one migrations folder, registry loader and generator, access engine, sign-in, sessions, users (Users page) and Profile, admin CLI, backup, bootstrap, attachments/uploads, rich text, errors, UI kit, data grid, app shell (rail, panel, quick switcher, phone nav), nav model, API client, session, frameworks for importers, exports, lookup lists, reports, jobs, seeds |
  | Foundation | `employees`, `programs`, `notifications` (notifications, notices, Inbox, Notices page, purge job), `audit` (central audit log, `writeAudit`, Global Audit Log page), `assignments` (custody) |
  | Feature | `assets` (physical assets, types, brands, condition ratings, conditions; issue/return sheets and Open Assignments page), `digital-assets` (digital assets and types), `maintenance` (requests, notes, Zoho webhook), `tasks` (tasks, events, attachments, task clock, My tasks pages), `grievances` (all grievance tables including its own audit log and case-file print page), `reviews` (all review tables including its own audit log and case-file print page) |

- **How modules use each other.** Modules use each other's public API plus kernel and foundation hooks.
  - A module may import another module's `index.ts` only, never its internals.
  - Each manifest declares `dependsOn`. The generator rejects unknown dependencies, cycles, a feature module `app.modules.ts` leaves out (until 17.2a: a disabled module that another enabled module depends on), and a foundation module that depends on a feature module.
  - Questions that need an answer from every module go through hooks, e.g. "does anything still reference this employee?".
- **Boundaries** are one Oxlint rule, `boundaries/imports`, in an in-repo JS plugin: `scripts/oxlint-boundaries.ts`, loaded through `jsPlugins` in `.oxlintrc.json`, so no new dependency. It resolves every import, `export … from` and `import()` to a repo path (relative, `#…` from the package.json `imports`, `@/`, `@shared/`), then refuses:
  - (a) web code → server code;
  - (b) a foundation module → a feature module;
  - (c) code outside a module → anything but that module's public API (`<side>/index.ts`), except that the generated registries may import manifests;
  - (d) shared code → server or web code;
  - (e) a `confidential` module → `foundation/notifications` (the Guardrail);
  - (f) kernel code (`server/`, `web/`, `shared/`) → a feature module, except through the generated registries (user's choice at the Phase 1 stop). It is switched on in Phase 14, once `modules/_legacy` is gone, so the move phases aren't blocked by temporary kernel imports.
  - Proven in spike 1.2:
    - The probes had 19 forbidden imports, among them relative escapes like `../../b/server/x.ts`, type-only imports, `export … from` and `import()`. It reported each once and none of the allowed ones.
    - Today's code passes, and type-aware lint time is unchanged (about 2.5 s).
  - Why not `no-restricted-imports`:
    - Its patterns see only the import text, so a relative path into a sibling module (`../../b/…`) gets through.
    - Overrides that set the same rule replace each other instead of merging.
    - A regex Oxlint can't compile (a lookahead) switches the rule off without any error.
    - `import/no-restricted-paths` doesn't exist in Oxlint 1.89.
  - The rule's logic is a pure function with its own Vitest test (`oxlint/plugins-dev` also ships a `RuleTester`).
- **Assignments become a generic custody ledger** (foundation module `assignments`).
  - It has one `assignments` table (`kind`, `item_id`, holder `employee_id` or `program_id`, issued and returned at and by), with one open row per `(kind, item_id)` and one holder.
  - Each asset module registers a custody kind: its label, whether an item can be issued now, which holders are allowed (physical: employee or program; digital: employee only), and issue/return hooks (physical records its condition snapshot in its own `conditions` table).
  - Asset modules depend on Assignments, never the reverse.
  - Each asset module ships a trigger that blocks deleting an item with custody history. This replaces the old `onDelete: 'restrict'` foreign key.
  - A hand-written migration merges `assignments` and `digital_assignments`.
  - Built in Phase 7 without issue/return hooks: each kind's service records its condition snapshot, audit entry and notification itself, right after `issue()` or `returnItem()` and in the same transaction, so its words and order stay as they were. A hook can come with the first kind that needs one.
  - The registry now lists modules in dependency order (employees, programs, assignments, audit, notifications, then features), which only changes the order of hook entries; no screen or response shows it.
  - While features move one by one, `employee.references` can ask a moved module before or after one still in `_legacy` (Phase 8: maintenance after Reviews). Only which blocker an archive refusal names can differ, and only for an employee blocked twice; FEATURES in its final order restores today's.
  - The access form's order doesn't follow the registry: each resource has an `order` (workspaces 10 Assets, 20 Grievances, 30 Maintenance, 40 Reviews, 50 Tasks).
- **Router.** Modules own their pages. TanStack Router's virtual file routes mount each module's `web/routes/` folder (under the `_app` layout, and at the root for print pages). **URLs don't change.**
  - Proven in spike 1.1: `virtualRouteConfig` in `vite.config.ts` is plain data (`{ type: 'physical', pathPrefix, directory }`), so no new dependency. `physical('', dir)` mounts a folder at the current level, `physical('/grievances', dir)` under a prefix. Directories are relative to `web/src/routes` (`../../../modules/<id>/web/routes`).
  - File naming inside a module is relative to its mount: under `/grievances`, `index.tsx`, `$code.edit.tsx`, `$code.entries.$seq.tsx`, with `route.tsx` as the prefix's layout (today's `grievances.tsx`). A module mounted at the root keeps today's names (`assets.$tag.tsx`). Print pages go in `web/print/`, mounted at the root.
  - The generated route ids and paths stay the same (117 keys), and the `createFileRoute('…')` ids in the files don't change. Only the generated import variable names in `routeTree.gen.ts` churn. `tsc -p web` passes and the route smoke passed 119/119 on the spike build.
  - Tailwind only scans Vite's root (`web/`), which drops classes used only in module files (11 rules in the spike). `web/src/styles.css` gets `@source '../../modules/*/web/**/*.tsx';` and the same for `foundation`, which gives byte-identical CSS. A directory glob (`modules/*/web`) does not work.
  - In dev, Vite serves module files, but it only regenerates the route tree for a new module file once a small plugin adds `modules/` and `foundation/` to `server.watcher`.
- **Permissions: a resource contract, starting with today's keys.**
  - Modules declare permission resources in their shared manifest (key, label, allowed levels, access-form placement, optional availability rule like Reviews' R9).
  - Every API route declares what it needs (`requires(resource, level)`, `serviceDecides(resource)` or `open()`). Anything undeclared is refused (default-deny).
  - The starting resources are today's sections, and `users.access` JSON is unchanged, so nobody's access changes.
  - Splitting into fine-grained resources (physical, digital, …) is a follow-up issue paired with #21.
- **Switches.** None: every module is always installed (the user's decision before the PR, Oct 23 2026, slice 17.2a). Modularity is for adding features, not switching them off. `FEATURES` in `app.modules.ts` lists every feature module in registry order, which is behaviour (the module that answers a hook first, such as the blocker an employee refusal names); `modules:gen` refuses a folder in `modules/` it leaves out. Removing a module is one change: its folder, its `FEATURES` line and a migration that drops its tables. There's no runtime setting.
  - Until then: a feature module was on when listed, foundation modules always on, and a disabled module's tables stayed while its routes, pages, jobs and hooks were off.
- **Migrations.** One migrations folder (`server/db/migrations`), as today. drizzle-kit reads `server/db/schema.ts` (kernel tables) plus `foundation/*/server/schema.ts` and `modules/*/server/schema.ts`. Splitting the schema must generate **no** migration. The only schema change in this refactor is the custody merge.
- **New modules.** `bun run new-module <name> [--foundation]` scaffolds the folder, manifests, README, schema, service, route, shared types, a page, a test and the `app.modules.ts` line. `docs/modules.md` is the written guide.
- **Behaviour.** The refactor is behaviour-neutral: same URLs, screens, API responses, access and notifications. The exceptions are default-deny for undeclared paths and the custody merge (invisible to users). Improvements spotted along the way go into `TODO.md`. Big ones also get a GitHub issue.
- **Documentation** is part of done for every phase, and stays current after this through checks in CI (Phase 16).
- **Order.** This refactor goes first. #14, #17, #18, #21 and #22 wait for it and are then built in the new shape.

## Ownership

Per-slice owners. `main` is this session; `agent-*` are subagents run in parallel inside one phase, each editing only the files listed. Shared files (`package.json`, `bun.lock`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json`, `Dockerfile`, `.github/**`, `app.modules.ts`, `*/modules.gen.ts`, `routeTree.gen.ts`, `CLAUDE.md`, this plan) always belong to `main`.

| Slice | Owner | Owns (files / section / topic) |
|---|---|---|
| 0.1 | main | git branches (done) |
| 0.2 | main | `docs/verify/fixed-clock.mjs`, `docs/verify/scratch-server.sh`, the `puppeteer-core` devDependency |
| 0.3 | agent-a | `docs/verify/routes-smoke.mjs`; `main` adds the CI steps |
| 0.4 | agent-b | `docs/verify/api-snapshot.mjs`, `docs/verify/baseline/api/**` |
| 0.5 | agent-c | `docs/verify/access-matrix.mjs`, `docs/verify/baseline/access.json` |
| 0.6, 0.7 | main | `docs/verify/schema-drift.sh`, `docs/verify/verify-done.sh` |
| 1.1–1.4 | main | spike code (deleted after), Decisions and Open risks in this plan |
| 2.1–2.5 | main | kernel registry, manifest types, `scripts/gen-modules.ts`, `modules/_legacy/**`, shared config |
| 3.1–3.7 | main | `server/app.ts`, `server/index.ts`, `server/bootstrap.ts`, `server/access/**`, `shared/permissions.ts`, `modules/_legacy/server/**` |
| 4.1–4.7 | main | `web/src/router*`, `web/src/lib/{nav,workspace,api}.ts`, `web/src/components/**`, frameworks pages, `modules/_legacy/web/**` |
| 5.x–7.x | main | `foundation/<name>/**` and the kernel and `_legacy` files each slice moves out of |
| 7.2, 7.5 | main | the custody migration in `server/db/migrations/**`, `docs/verify/migration-check.mjs`, its fixture |
| 8–13 a, b, f, g | main | `modules/<name>/server/schema.ts`, `modules/<name>/shared/**`, `modules/<name>/README.md`, `_legacy` removals |
| 8–13 c, e | agent-s | `modules/<name>/server/**` except `schema.ts`, and the `server/services`, `server/routes`, `server/tests` files of that module that it moves |
| 8–13 d | agent-w | `modules/<name>/web/**`, and the `web/src/routes/_app/**`, `web/src/features/<name>/**` files of that module that it moves |
| 14.x–15.x | main | kernel cleanup, `server/testing/**`, `scripts/new-module.ts`, `scripts/templates/module/**`, `docs/verify/new-module-proof.sh`, `docs/modules.md` |
| 16.1, 16.6 | main | `docs/architecture.md`, `scripts/docs-check.ts` |
| 16.3–16.5, 16.7 | agent-d | `README.md`, `RUNBOOK.md`, `DEPLOY-GUIDE.md`, `PRODUCT.md`, `DESIGN.md`, `TODO.md`, `design-qa.md`, `brand-assets/README.md`, `.github/pull_request_template.md` |
| 16.2, 16.8, 17.x | main | `CLAUDE.md`, the other issues (with the user's OK), the PR |

## Module map (where today's code goes)

| Today | Goes to |
|---|---|
| `server/db/schema.ts` | kernel keeps `users`, `sessions`; every other table moves to the module that owns it (map above) |
| `shared/constants.ts`, `schemas.ts`, `types.ts` | each module's `shared/`; the kernel keeps access levels, dates, CSV, tags, rich text, passwords, secrets and the manifest types |
| `shared/importers.ts`, `web/src/lib/exports.ts` | frameworks stay in the kernel; each importer and export moves to its module |
| `shared/permissions.ts` | the engine stays in the kernel; workspace and section lists come from the registry; task rules (`canViewEmployeeTasks`, …) go to `tasks` |
| `server/app.ts` (`accessNeeded`, `UPLOAD_PATH`, route mounting) | replaced by route-level declarations and registry mounting |
| `server/index.ts` (tidy, task clock) | registered jobs |
| `server/bootstrap.ts` (`ensureDefaultLists`) | each module's startup hook |
| `server/seed.ts`, `grievance-seed.ts`, `review-seed.ts`, `task-seed.ts` | kernel seed runner; each module's `server/seed.ts` |
| `server/services/lists.ts`, `routes/lists.ts`, `routes/_app/lists.tsx` | Lookup-lists framework in the kernel; each list (asset types, brands, condition ratings, digital types, grievance categories) in its module |
| `server/services/reports.ts`, `imports.ts`, `refs.ts` | split by owner; `refs.ts` helpers go to the public API of `employees` and `programs` |
| `web/src/lib/queries.ts`, scattered `useWrite` calls | each module's `web/queries.ts` and `web/api.ts` |
| `web/src/lib/workspace.ts`, `nav.ts` | derived from manifests (workspaces declared by modules, pages contributed by workspace id; today's placement kept) |
| `web/src/features/common/*` | kernel components (`web/src/components/…`) |
| `web/src/routes/_app/users.tsx`, `me.profile.tsx`, `login.tsx`, `password-change.tsx` | kernel |
| `server/tests/api.test.ts`, `grievances.test.ts`, … | split into each module's tests; `helpers.ts` becomes the kernel test kit |

## Out of scope

- The features waiting on this refactor: #14 (My Dashboard), #17/#18 (Administration area), #21 (permission groups), #22 (MAC address).
- Splitting permission resources further (a new issue, paired with #21).
- Any UX, URL or API change beyond default-deny.
- The colour and logo redesign (planned last).

## Guardrails

- Behaviour-neutral, proven by the baselines from Phase 0: the API snapshot, the access matrix and the route smoke are identical except where this plan says otherwise.
- **No data loss:** every migration is rehearsed on a copy of the latest production backup before deploy, and production is backed up again right before deploy.
- The schema split generates no migration (`drizzle-kit generate` produces nothing).
- Grievances and Reviews never send notifications or show counts. The registry refuses notification kinds from a module marked `confidential`, and a lint rule stops them importing `notifications`.
- Nothing from inside a workspace is stored in the browser, as today.
- One phase, one commit, on `refactor/issue23-modular-architecture`, pushed after each phase. Never commit to `main`. One PR at the end, opened only with the user's permission.
- Production is never touched during the work. Deploying (17.4) and editing other issues (16.8) wait for the user's go-ahead after the merge.
- The only new dependency is `puppeteer-core` (dev). `trustedDependencies` stays as it is.
- Phases run in order. Within a feature phase, subagents may split server and web work, with **disjoint file ownership** named on the slice.
- `bun run format` before each commit. `docs/verify/quick-check.sh` passes at the end of every phase.

## Definition of Done

**Scripted** (`docs/verify/verify-done.sh` exits 0):
- `bun run typecheck`, `lint`, `format:check`, `test` and `build` exit 0.
- `bun run modules:gen --check`: the registries are up to date and the dependency graph is valid.
- `bun run lint` includes the boundary rules: no web → server imports, no foundation → feature imports, no imports of another module's internals, no `shared` → server/web imports, no `notifications` imports from a confidential module.
- The built CSS equals Phase 0's (`docs/verify/baseline/web-css.sha256`).
- Schema drift: `drizzle-kit generate` produces no new migration.
- `node docs/verify/api-snapshot.mjs --compare` matches the Phase 0 baseline.
- `node docs/verify/access-matrix.mjs --compare` matches the baseline, except that undeclared paths are now refused.
- `node docs/verify/routes-smoke.mjs` passes. It also runs in the CI `test` job.
- `node docs/verify/migration-check.mjs` passes on the production-shaped fixture: row counts per table, foreign keys, and remapped digital assignment ids.
- **Extensibility proof:** `docs/verify/new-module-proof.sh` scaffolds a throwaway feature module with a table, a route, a page and a nav entry. The only paths that change are its folder, one line in `app.modules.ts`, the generated registries/route tree and one migration. It then runs typecheck, tests and the route smoke, and removes the module.
- `bun run docs:check` passes: every module has a README with the required sections, the generated module table in `docs/architecture.md` is current, and every file path quoted in the Markdown docs exists.
- No old central files remain: `accessNeeded`, `UPLOAD_PATH`, `IMPORTERS`/`EXPORTS` literals, `WORKSPACE_HOME`, `web/src/lib/queries.ts`, `modules/_legacy/`.

**Manual** (user confirms):
- The migration-check output on the production-shaped fixture shows all employee, grievance, maintenance and custody data intact.
- A walk through the app at desktop and phone width shows nothing changed.
- The docs read correctly to someone new to the codebase.

## Open risks

- ~~**Virtual routes:** mounting several modules' folders under one `_app` layout may clash in TanStack's generator.~~ Settled by spike 1.1: no clash (see Decisions, Router). What's left: Tailwind `@source` and the dev watcher must cover every module folder.
- ~~**Lint boundaries:** Oxlint's `no-restricted-imports` with `overrides` may not express every rule.~~ Settled by spike 1.2: an in-repo Oxlint JS plugin (see Decisions, Boundaries). What's left: if an Oxlint upgrade ever breaks `jsPlugins`, the same pure function can run as `scripts/check-boundaries.ts` in `bun run lint`.
- ~~**Subpath imports** must work under Node type stripping, tsx, Vite, Vitest, both tsconfigs and the Docker image.~~ Settled by spike 1.3 (see Decisions, Layout).
- **Styling:** the route smoke can't see a Tailwind class lost because a module folder isn't scanned. `verify-done.sh` therefore checks that the built CSS still equals Phase 0's (`docs/verify/baseline/web-css.sha256`).
- **Custody merge:** digital assignment ids change when merged. Anything that stores them (audit entries, notification source keys) must be remapped in the same migration. Production likely has no asset rows, but the migration is written and tested as if it did.
- The baselines are only as good as the seeded data: every page and endpoint must be reached by the seed.
- **No rehearsal on real data** (the user's choice). The production-shaped fixture can miss oddities that only real data has. The backup right before deploy and the RUNBOOK migration check are the safety net.
- The squash-merged PR is one very large commit: `git blame` needs `-C -C` to follow moved code. Keep files recognisable when moving them (move first, then reshape, within each phase).

## Phase 0 - Safety net and baselines

Recorded from unchanged code, so every later phase can prove it changed nothing.

- [x] 0.1 Create `refactor/issue23-modular-architecture` from `origin/main`. With the user's OK, removed the stale local branches `feature-task-system` (squash-merged as PR #2) and `new-features` (merged).
- [x] 0.2 Fixed clock for seeding: `FIXED_NOW` and the `docs/verify/fixed-clock.mjs` preload (`node --import`) freeze `Date` for the seed **and** the scratch server, with no app code changed, so two runs give identical data and the server's own clock (overdue, task clock) matches. `scratch-server.sh` loads it and takes `ROOT`. Left non-deterministic, and normalised by the baselines: password salts and SQLite's `unixepoch()` `created_at` defaults.
- [x] 0.3 `docs/verify/routes-smoke.mjs`: on the scratch server, sign in as Priya (Super Admin) and Marcus (Admin). Open every route in the route tree, including one seeded record per detail page and both case-file print pages. Fail on any console error, error boundary, blank main region or not-found text. Add `puppeteer-core` as a devDependency; make `CHROME` and the `scratch-server.sh` `ROOT` env vars with today's defaults; add the Chrome install (`@puppeteer/browsers`), scratch server and smoke run to the CI `test` job.
- [x] 0.4 `docs/verify/api-snapshot.mjs`: as Priya and Marcus, GET every list and detail endpoint and store the normalised JSON in `docs/verify/baseline/api/`. `--compare` diffs against it.
- [x] 0.5 `docs/verify/access-matrix.mjs`: for each API route and method, the status for accounts at None, Read, Edit and Full in each section, plus Super Admin, plus a made-up path per prefix. Stored in `docs/verify/baseline/access.json`; `--compare` diffs.
- [x] 0.6 `docs/verify/schema-drift.sh`: runs `drizzle-kit generate` into a temporary folder and fails if it writes anything.
- [x] 0.7 Rewrite `docs/verify/verify-done.sh` for this plan's Definition of Done (lines for later phases report SKIP until their tool exists).

## Phase 1 - Spikes (prove the risky parts first)

Throwaway code. Each spike is deleted after it is decided; only its result goes into Decisions.

- [x] 1.1 Virtual file routes: mount two folders outside `web/src/routes` under `_app` (one with a `/grievances` prefix, one at the root) and one print page at the root, with the URLs and `routeTree.gen.ts` behaving as today. Decide the in-module route file naming. If it fails, switch Decisions to generated thin route files.
- [x] 1.2 Boundary rules in Oxlint: (a) `web/**` and `*/*/web/**` may not import server code; (b) `foundation/**` may not import `modules/**`; (c) another module only via its `index.ts`; (d) `*/shared/**` imports no server or web code. If Oxlint can't express one, plan `scripts/check-boundaries.ts` instead.
- [x] 1.3 Subpath imports (`#kernel/*`, `#shared/*`, `#foundation/*`, `#modules/*`): resolved by `node` (type stripping), `tsx watch`, Vite, Vitest, `tsc` for both tsconfigs and the built Docker image.
- [x] 1.4 Record the outcomes in this plan's Decisions and Open risks. Added from them: the CSS baseline check in `verify-done.sh` (`docs/verify/baseline/web-css.sha256`, the built CSS at Phase 0).

## Phase 2 - Kernel scaffolding and the registry

- [x] 2.1 Create `foundation/` and `modules/`. Add the package.json `imports` map. Update the tsconfig `include` lists (web: `*/*/web`, `*/*/shared`; server: `*/*/server`, `*/*/shared`), the Vitest include, the drizzle-kit schema list, the Dockerfile `COPY` lines, the Oxfmt ignore for the generated registries (Oxlint still lints them: they are plain imports), the Tailwind `@source` lines and the dev watcher plugin from 1.1, and the `boundaries/imports` plugin from 1.2 with its test (`scripts` joins the server tsconfig and Vitest includes so the plugin and `gen-modules.ts` are checked).
- [x] 2.2 Manifest types in the kernel. `defineSharedManifest` takes id, tier, label, `dependsOn`, `confidential`, permission resources, notification kinds and labels, audit entity types and the API `routePrefix`. `defineServerModule` takes schema, routes with base path, public webhooks, jobs, startup, seed and hooks. `defineWebModule` takes the routes folder, workspaces, nav pages, slots, exports, importers UI and lookup-list editors.
- [x] 2.3 `app.modules.ts`: the ordered list of enabled feature modules. `scripts/gen-modules.ts` (`bun run modules:gen`, `--check` in CI and verify-done) writes `shared/modules.gen.ts`, `server/modules.gen.ts` and `web/src/modules.gen.ts` with typed static imports. Every foundation folder is always included; features come from the list. It rejects unknown, disabled or cyclic dependencies, duplicate ids, resources, notification kinds or audit entity types, and foundation → feature dependencies. Plain Node can't import the website's `.tsx`, so it reads the shared manifests only: duplicate route bases, webhook bases, job names and workspace ids, and a side that uses another module's manifest, are caught by `registryProblems()` in the server and web registry tests. Run it from a Vite plugin in dev.
- [x] 2.4 Kernel hook and slot registries, typed: `employee.references`, `program.references`, `custody.kinds`, `notification.kinds`, `audit.entityTypes`, `lists`, `importers`, `exports`, `reports`, `jobs`, `startup`, `seed`; web slots `employee.detail`, `home.widgets` (ready for #14).
- [x] 2.5 `modules/_legacy/`: a temporary feature module that mounts everything not yet moved (its routes, schema re-export, jobs, nav), so the app keeps working while each later phase moves its own code out. Its `/notices` router wraps `requireSuperAdmin` itself, as `app.ts` does today; its web nav comes in Phase 4, when the rail reads the registry. It's deleted in Phase 14.
- [x] 2.6 CI: add `workflow_dispatch` to `.github/workflows/super-linter.yml` (user's choice at the Phase 1 stop). After the Phase 2 push, run it once on the branch (`gh workflow run CI --ref refactor/issue23-modular-architecture`) so the route-smoke step is proven on GitHub before the PR; fix anything it finds in this phase.

## Phase 3 - Server kernel: access, routing, uploads, jobs

- [x] 3.1 Route-level access: `requires(resource, level)`, `serviceDecides(resource)` (the service decides above Read, as Grievances, Reviews and Tasks do today) and `open()` (signed in, no section: My Space, the employee list for reading, imports). The kernel mounts each module's router at its manifest base path. Done in `server/access/route.ts`, with `superAdmin()` for Users and notices; each declaration is its route's first handler, so access is checked before the body is read.
- [x] 3.2 Default-deny: at startup and in a test, walk Hono's route list and fail if any `/api` route lacks a declaration. An undeclared path is refused, never treated as Assets. Delete `accessNeeded()`. Give `_legacy` routes their declarations, matching today's rules one for one. `createApp` throws on an undeclared route; `server/access/route.test.ts` checks the real app starts with none, and that an undeclared path is 404 signed in and 401 signed out.
- [x] 3.3 Uploads: an `upload()` route marker sets the larger body limit after the session check. Delete `UPLOAD_PATH` and `isUpload`. The app-wide 4 MB limit steps aside through `forUpload(c)` (`server/http.ts`): a multipart body whose matched routes include an `upload()` handler.
- [x] 3.4 Jobs: modules register `{ name, every, run }`. `server/index.ts` runs them from the registry, each in its own try/catch as today (session purge in the kernel; notification purge, overdue reminders and the task clock registered through `_legacy` until their modules move).
- [x] 3.5 Startup and seeds: `ensureDefaultLists` and the seed scripts call each module's `startup` and `seed` in dependency order (`startModules`, `seedModules` in `server/registry.ts`; startup runs before `ensureBootstrapAdmin`, since the default lists go into a database with no users only). The demo data of today's sections stays in `server/seed.ts` until each moves into its module.
- [x] 3.6 Permission resources: `Section`, `SECTIONS`, `SECTION_LABEL`, `levelsFor`, `WORKSPACES` and `workspacesOf` come from the registry (a generated union type). The Reviews R9 rule moves to the resource's availability rule. `users.access` is unchanged. The types are derived from the generated `SHARED_MANIFESTS` (`ResourceKey`, `WorkspaceKey` in `shared/registry.ts`); the levels moved to the leaf `shared/levels.ts`, the only kernel file a manifest may import besides `shared/modules.ts` (the others read the registry as they load).
- [x] 3.7 Access matrix compares clean except for refused undeclared paths, and the API snapshot compares clean.

## Phase 4 - Web kernel: router, nav, data layer, frameworks

- [x] 4.1 Router: the virtual route config is built from the registry (per 1.1). The `_legacy` module mounts today's `web/src/routes` files unchanged. `routeConfig()` in `vite.config.ts` writes it as plain data: each module's `web/routes/` under the app layout at its `routePrefix`, `web/print/` at the root; the generated route ids and paths are the same as before.
- [x] 4.2 Nav model: workspaces are declared by modules. Pages are contributed by workspace id, with order, groups, badges and the `confidential` flag from manifests. `workspace.ts`'s URL map is derived. The rail, panel, switcher and phone nav look exactly as today. `_legacy` declares today's in `modules/_legacy/web/nav.ts`; Home and its Dashboard and Profile pages stay the kernel's (`HOME_GROUPS` in `web/src/modules.ts`). A workspace holds the addresses at and under its `home`, so the URL map needs no list. `registryProblems` refuses a page in an unknown workspace or group, a badge on a confidential workspace, and a workspace resource with no rail entry. Nav pages' `to` are checked against the route tree (`RoutePath`).
- [x] 4.3 Data-layer convention: each module's `web/queries.ts` (query options) and `web/api.ts` (`useWrite` mutations, invalidations). The kernel keeps the API client, `useWrite` and session. Written down in the `web/src/modules.ts` header. No module lists invalidations: `refreshData` already refreshes every query but `me` after a write. Today's queries stay in `web/src/lib/queries.ts`, and each moves straight into its module in that module's phase, so none moves twice.
- [x] 4.4 Users access form, `describeAccess` and level help are generated from permission resources, so they look as they do today. Each resource carries `help` (a line per level) and an optional `hint`; `shared/constants.ts` reads them as `levelHelp` and `SECTION_HINT`, the Users and Profile pages use those, and `web/src/features/users/level-help.ts` is gone. `bun run modules:gen` refuses a level left unexplained, or help for a level the resource doesn't offer.
- [x] 4.5 Frameworks read the registry: the Lookup lists page, the Import/Export page, exports and importers. The frameworks are the kernel's (`server/app.ts` mounts `/import` and the lists after the module routes); `_legacy` registers today's entries: `hooks.lists` and `hooks.importers` on the server, `exports`, `importers` and `lists` on the website (the editors are in `web/src/features/lists/editors.tsx`). `importerFor` and `IMPORT_TYPES` are gone. The registries no longer import `modules.gen.ts`: `server/index.ts`, `server/seed.ts`, `main.tsx` and each Vitest project's setup file call `installModules`, so kernel code a module imports never loads the modules halfway through (an ESM cycle) and a module may read kernel values as it loads. Both `registryProblems` refuse a duplicate list address, importer, export or lookup list.
- [x] 4.6 Slots: `<Slot name="employee.detail" …/>` on the employee page and `home.widgets` on Home, rendering module contributions in registry order. `<Slot>` (`web/src/components/slot.tsx`) draws the entries the account may see (`slot(name, user)`), and nothing at all when there are none. `employee.detail` is under the employee's edit sheet. Home (`/me`) draws `home.widgets` as My Dashboard once a module gives one, and opens on the Inbox until then, as today; #14 gives the panel's My Dashboard entry its `to`.
- [x] 4.7 Route smoke, API snapshot and access matrix all pass.

## Phase 5 - Foundation: employees and programs

- [x] 5.1 `foundation/employees`: table, service, routes (`requires` / `open()` for reading), pages (`employees.index`, `employees.import`), importer, queries, seed, tests, README. The pages were moved with `git mv` to `web/routes/` (`index.tsx`, `import.tsx`) beside `employees-page.tsx` and `employee-parts.tsx`; the route ids are unchanged. Each foundation module has `web/{queries,api,exports,module,index}.ts`.
  - Callers in other modules and the kernel import from `#foundation/<name>/{server,shared,web}/index.ts`, never a file inside it.
  - Seeds live in `foundation/*/server/seed.ts` and `server/seed.ts` calls them where the old code was, so the demo data comes out the same. Foundation routers mount first, before `_legacy`'s.
  - Exports are built with `defineDataset` (`web/src/lib/exports.ts`), and each has an `order`: `exportDatasets()` sorts by it, so the Export tab keeps today's order whichever module gives the dataset.
  - The shared column helpers are in `server/db/columns.ts`; the Users page's router is `server/routes/users.ts`, still the kernel's.
  - `employee-parts.tsx` still reads the asset queries and the issue sheet from `web/src`, until `employee.detail` slots replace them. The nav entry stays in `_legacy/web/nav.ts`.
- [x] 5.2 `employee.references` hook: `deleteEmployee` and archive ask every module "does anything of mine still reference this employee?" instead of counting other features' tables. `_legacy` registers the current checks until their owners move. The hook (`foundation/employees/server/references.ts`) answers for a batch of employees: figures for the row, a delete blocker and an archive blocker. The service asks every module in registry order, and the first blocker found is the one given; the linked account is checked last. `_legacy` registers five answers, in today's order: custody (`server/services/assignments.ts`), conditions assessed (`assets.ts`), grievances, maintenance and reviews; each lives in its feature's service and moves with it.
  - Each answer leaves out of its figures what the viewer may not see in its workspace, so `employeeFor` is gone; the delete reason still reads "Has records you cannot see" to anyone who can't see every workspace (`HIDDEN_BLOCK`).
- [x] 5.3 `foundation/programs`: table, service, routes, page, `program.references` hook, seed, tests, README. `refs.ts` helpers (`requireEmployee`, `requireProgram`, `assessorFor`) move to these public APIs. Programs has no resource of its own: its page and API stay behind `assets`. `program.references` answers with figures, a delete blocker and a deactivate blocker; `_legacy` answers for custody.
  - `requireEmployee`, `employeeRef`, `fullName`, `requireProgram` and `programRef` moved; `assessorFor`, `requireActiveRating` and `loadLookups` stay in `server/services/refs.ts`, since they read asset tables.
  - The employee and program tests moved from `server/tests/api.test.ts` to `foundation/*/server/*.test.ts`, with a test that each hook is asked in registry order.
- [x] 5.4 Baselines pass; `quick-check.sh` passes. Route smoke 119/119, API snapshot 95 files equal, access matrix equal apart from refused undeclared paths, schema drift none.

## Phase 6 - Foundation: notifications and audit

- [x] 6.1 `foundation/notifications`: `notifications` and `notices` tables, `notify()`, `accountOf()`, Inbox and Notices pages, the bell count, the purge job, tests and README. Notification kinds and labels come from module manifests. The registry refuses kinds from `confidential` modules, and the lint rule bars `grievances` and `reviews` from importing it.
  - `NotificationKind` is the union of the manifests' kinds; `notificationKinds()` replaces `NOTIFICATION_KIND_LABEL`, and `notify()` refuses a kind no enabled module declares. The module declares `notice` and the kernel's `account_*` kinds.
  - `employeeNotificationKinds` in a manifest replaces `AS_EMPLOYEE`; the generator checks they are the module's own kinds.
  - `relinkAsset` became `relinkNotifications(tx, from, to)`. `sendOverdueReminders` moved to `server/services/assignments.ts`; its job stays in `_legacy` with custody.
  - The Inbox router mounts at `/me`, `_legacy` mounts `myTaskRoutes` at `/me/tasks`, and `server/routes/me.ts` is gone. The purge job and the Inbox and Notices nav entries (order 20 and 30) moved to the module; `canSendNotices` to its shared side.
- [x] 6.2 `foundation/audit`: `audit_log`, `writeAudit`, the Global Audit Log page and component, entity types from manifests, tests and README. The grievance and review audit logs stay with their modules.
  - `AuditEntityType` is the union of the manifests' entity types, so `writeAudit()` takes only declared ones, and it refuses an undeclared one at run time too. The module declares `user`; the generator refuses entity types from a confidential module.
  - `Actor` moved to the kernel (`server/lib/actor.ts`): the signed-in account extends it, and the grievance and review services need it.
  - The audit routes (`/audit`, `/audit.csv`) left `reportRoutes` and mount at base `''`. The log reads left `reports.ts`; the dashboard's recent entries use the new `latestAudit()`, and the grievance and review logs import `ACTOR` and `auditWhere` from the public API.
  - The log component and the shared paging (`logQuery`, `logCsvUrl`, `AuditParams`) are the module's web API; the nav entry stays in `_legacy` until the workspaces move.
- [x] 6.3 Baselines pass, including every notification kind's label and link.
  - The seeded Inbox has three kinds, so the labels were also checked against the last commit's `NOTIFICATION_KIND_LABEL`: all 19 match.

## Phase 7 - Foundation: assignments (custody ledger)

- [x] 7.1 Schema: `assignments` (`id`, `kind`, `item_id`, `employee_id`, `program_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`), a unique open row per `(kind, item_id)`, the one-holder check and indexes. `conditions.assignment_id` keeps its foreign key.
  - `foundation/assignments/server/schema.ts`, with `ix_assignments_item` on `(kind, item_id)`. The kernel's `conditions` imports it for its foreign key, and `describeError()` maps the new unique index to the same 409 `asset_already_assigned`.
- [x] 7.2 Custom migration (`drizzle-kit generate --custom`), in one transaction: copy physical assignments with their ids (`kind = 'asset'`) and digital assignments with new ids (`kind = 'digital-asset'`). Remap any stored digital assignment ids (audit entries, notification source keys; list them first). Drop the old tables. Add the delete-guard triggers for both kinds. Row counts before and after are asserted in a test.
  - 7.0, the list: nothing stored names a digital assignment's id. Digital audit entries name the seat (`digitalasset`, its id) and digital notifications `digital:<seat id>`; `assignment:<id>` (overdue) and `return-bulk:<id>` are physical only, and physical ids are kept. So nothing is remapped.
  - `0024_custody_ledger.sql`: digital rows are numbered after `max(seq, max(id))` of the physical ledger, in their own order, and the counter carries on from the highest. `conditions` is set aside and put back, as in 0005 and 0023.
  - Four triggers stand in for the foreign keys `item_id` can't have: `assignments_item_exists` (no row for an item that isn't there), `assignments_item_fixed` (a row keeps its item), `assets_keep_held` and `digital_assets_keep_held` (an item with history is never deleted).
  - `generate --custom` copies the previous snapshot, so `0024_snapshot.json` was written with `generateSQLiteDrizzleJson` (`drizzle-kit/api`); schema drift is clean.
  - `foundation/assignments/server/migration.test.ts`: ids, counts, counters, the check, the unique index and every trigger, on empty ledgers too.
- [x] 7.3 Custody API: `registerKind`, `issue`, `returnItem`, `openFor(kind, itemIds)`, `historyOf`, `heldBy(employeeId | programId)`. Holder rules per kind. `employee.references` and `program.references` contributions from custody.
  - `registerKind` is the `custody.kinds` hook (`CustodyKind`: label, holders, workspace, figure, phrases, `issueBlocked`); `requireHolder()` checks the holder against the kind. `custody.test.ts` covers the API directly.
  - The references moved from `_legacy` to the module, one blocker per kind in registry order: the employee's words ("still has N digital asset(s). Unassign them before archiving.") are unchanged.
- [x] 7.4 `_legacy`'s asset and digital-asset services call the custody API. The issue/return tests, including bulk return and poor-return notifications, pass unchanged.
  - `_legacy` registers `asset` and `digital-asset` (physical first). Its services keep their own pre-checks, words and order, and write conditions, audit entries and notifications after `issue()`/`returnItem()`, in the same transaction. Only the raw-SQL fixtures in `api.test.ts` changed (the new columns).
- [x] 7.5 Rehearsal (no real data, per Decisions): `docs/verify/migration-check.mjs` builds a database at the pre-merge migration, adds a production-shaped fixture (physical and digital assignments open and returned, conditions, audit entries and notification source keys pointing at digital assignment ids), runs the migrations, and checks per-table row counts, foreign keys (`PRAGMA foreign_key_check`), the remapped ids and the delete-guard triggers. Then the route smoke runs against the migrated copy. Add the deploy-time run against the pre-deploy backup to `RUNBOOK.md`.
  - The fixture is the pre-merge commit's seed (a temporary git worktree), plus counters ahead of the highest ids, digital audit entries and notifications, an overdue reminder and a bulk return. 18 checks pass: 145 physical assignments keep their ids, 28 digital ones come after 150, and conditions, audit entries, notifications and other counters are unchanged. `--db <file>` runs it on a copy of a backup, and `KEEP=<dir>` keeps the migrated copy.
  - The route smoke passed 119/119 on the migrated copy. The API snapshot differs only in the two digital-assets lists' `assignmentId`s (the custody merge), so those two baseline files were re-recorded; the access matrix and schema drift are clean.
  - `RUNBOOK.md` 7: the 0024 paragraph, with the rehearsal on the pre-upgrade backup through `docker compose run` with `docs/verify` mounted (the image has no `docs/`). Checked in a throwaway image on a scratch pre-merge seed mounted read-only: 18 PASS. The script copies the file's bytes and never opens the backup, because a WAL database opened read-only still writes a `-shm` beside it.

## Phases 8–13 - Feature modules (one phase each)

Every feature phase does the same slices, in this order, then removes its code from `_legacy`:

- **a. Schema**: tables to `modules/<name>/server/schema.ts` (table names unchanged); schema drift clean.
- **b. Shared**: its constants, labels, schemas, types and permission rules to `modules/<name>/shared/`, exported from `shared/index.ts`; the manifest declares resources, notification kinds and audit entity types.
- **c. Server**: services and routes with route-level declarations; hooks (references, custody, lists, importers, reports), jobs, startup and seed; imports of other modules through their public API only.
- **d. Web**: route files into `web/routes/`; feature components into `web/`; `queries.ts` and `api.ts`; nav pages, slots, exports and list editors through the manifest.
- **e. Tests**: its tests moved and split out of `api.test.ts` or its feature test file into `modules/<name>/**/*.test.ts`, using the kernel test kit.
- **f. README**: `modules/<name>/README.md` (what it does, tables, resources and rules, hooks it provides and uses, pages, jobs, notifications, gotchas).
- **g. Check**: baselines, route smoke, schema drift and `quick-check.sh` pass; nothing of it left in `_legacy`.

### Phase 8 - `maintenance` (pilot)
- [x] 8.1 a. Schema
  - `maintenance_requests` and `maintenance_notes` in `modules/maintenance/server/schema.ts`, names, indexes and checks unchanged; schema drift clean.
- [x] 8.2 b. Shared
  - Statuses, labels, `maintenanceCode`, limits, the four schemas and the row/detail/note types moved out of `shared/{constants,schemas,types}.ts`. `calendarDate` is now exported from `shared/schemas.ts` for it.
  - The manifest holds the `maintenance` resource (`order: 30`), both notification kinds (employee kinds too) and the `maintenance_request` audit type, all taken out of `_legacy`'s.
  - `PermissionResource` gained `order`: `permissionResources()` sorts by it, so the access form keeps Assets, Grievances, Maintenance, Reviews, Tasks (10–50) whatever the registry order.
- [x] 8.3 c. Server
  - `routes.ts`, `service.ts` and `webhook.ts` moved (`git mv`). The webhook is declared `{ base: '/maintenance' }` with `post('/')`, so the URL stays `/api/webhooks/maintenance`, before the sign-in check; its secret stays in `server/config.ts`.
  - `requireActiveEmployees` moved from the grievances service to `foundation/employees` (grievances, reviews and maintenance all use it).
  - It answers `employee.references` itself. Until Reviews moves, it is asked after Reviews instead of before (the first blocker is the one given); FEATURES in its final order restores today's order.
- [x] 8.4 d. Web
  - The four route files under `web/routes/` (mounted at `/maintenance`), `status.tsx`, `page-title.ts` and `queries.ts`; the workspace (rail `order: 20`) and its nav page in `web/module.ts`. Route ids and paths unchanged.
- [x] 8.5 e. Tests
  - `maintenance.test.ts` moved next to the code; its three notification tests split out of `notification-events.test.ts` into `notifications.test.ts`. The registry tests follow the new order.
- [x] 8.6 f. README
  - `modules/maintenance/README.md`; `foundation/employees/README.md` names the new answerer and `requireActiveEmployees`.
- [x] 8.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` webhook path, 403 → 404), route smoke 119/119, schema drift clean, `quick-check.sh` passes. `_legacy` has no maintenance left.

Also: the Zoho webhook is declared as a public webhook route (shared secret, before the sign-in check), and `docs/modules.md` gets a first draft from what the pilot taught.
  - Done: `docs/modules.md` (first draft) has the layout, the import rules, the move recipe in the order the pilot used, pages, webhooks and the order note.

### Phase 9 - `assets`
- [x] 9.1 a. Schema
  - `asset_types`, `asset_brands`, `condition_ratings`, `assets` and `conditions` moved to `modules/assets/server/schema.ts`; drizzle-kit already reads `modules/*/server/schema.ts`. No migration.
- [x] 9.2 b. Shared
  - Constants, schemas and types moved to `modules/assets/shared/`. The kernel keeps `namedListCreateSchema`/`namedListUpdateSchema`, `tooLong` and `NamedListRow`, which the digital asset types use too.
  - The manifest holds the `assets` resource (`order: 10`), `asset_issued`, `asset_returned_poor` and `asset_overdue` (the first and last are employee kinds) and the five audit types. `_legacy` now `dependsOn` assets.
  - The seed's physical part is `seedAssets` (`server/seed.ts` calls it in place); the API snapshot shows the seed unchanged.
- [x] 9.3 c. Server
  - `routes.ts`, `service.ts`, `assignments.ts`, `refs.ts` and `dashboard.ts` moved (`git mv`). `/lookups` and `/dashboard` are mounted at base `''`, next to `/assets` and `/assignments`.
  - The module registers `custody.kinds` (`asset`), `employee.references` (conditions), the three lookup lists, the startup hook (`ensureDefaultLists`, out of `server/bootstrap.ts`) and the `notifications.overdue-reminders` job. `assertNotLastActive` stays in the kernel, generic over the table.
  - The `reports` hook keeps its first shape: the Overview is this module's own page, so nothing registers a report yet.
- [x] 9.4 d. Web
  - The five pages (`/`, `/assets`, `/assets/$tag`, `/assignments`, `/available`) are in `web/routes/`, with the sheets, `open.ts`, quick add and actions. The asset queries, badges and cells (with `isOverdue`), list editors and the two exports moved too. Route ids and paths unchanged.
  - The kernel keeps `nameListColumns` and `NameList` (the digital asset types use them). Lists keep their order without an `order` field: the Lookup lists page draws each column in registry order.
  - Three new slots, in place of `employee.detail` (which the asset UI never used): `employee.actions` (Issue to), `employee.holdings` (the physical part of What they hold) and `program.actions` (Assign to). A `Slot` without a `className` adds no wrapper. The holdings sheet's "nothing held" now comes from the row's own counts.
  - Until 14.5 and Phase 10, the kernel imports `#modules/assets/web/index.ts` (the app layout's sheets, and `lookupsQuery` for the Users and digital assets pages), and `server/seed.ts` imports `seedAssets`. Phase 10 took the digital assets pages' share.
- [x] 9.5 e. Tests
  - `asset-fields.test.ts` moved; the asset parts of `api.test.ts` are in `assets.test.ts` and its notification tests in `notifications.test.ts`. The export tests moved with the exports. The registry tests follow the new order.
- [x] 9.6 f. README
  - `modules/assets/README.md`.
- [x] 9.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` paths), route smoke 119/119, schema drift clean, `quick-check.sh` passes. In a browser (Priya and Marcus), Issue to and Assign to open their sheets with the holder chosen, Issue to is disabled for an archived employee, Grievances' Employees page has none, and What they hold lists the physical assets. `_legacy` has no physical assets left.

Also: asset types, brands, condition ratings and conditions. The registered custody kind `asset` (holders employee or program; condition snapshot on issue and return; retired assets refused). Issue and return sheets and the Open Assignments page. The Assets workspace and its home at `/`. The overdue-reminders job. Asset importers and exports. The asset parts of reports and lists. The `employee.detail` slot contribution.

### Phase 10 - `digital-assets`
- [x] 10.1 a. Schema
  - `digital_asset_types` and `digital_assets` moved to `modules/digital-assets/server/schema.ts`, names and indexes unchanged. No migration.
- [x] 10.2 b. Shared
  - Statuses, schemas, types and `secrets.ts` (with its test) moved to `modules/digital-assets/shared/`. The manifest has no resource (it uses `assets`), `dependsOn` assets, and holds `digital_issued` (an employee kind) and the two audit types. `_legacy` now depends on nothing and has no employee kinds.
  - `DigitalLookups` extends the assets module's `Lookups`, which drops `digitalAssetTypes`.
- [x] 10.3 c. Server
  - `routes.ts` and `service.ts` moved (`git mv`); the types list is the module's `lists.ts`, leaving `assertNotLastActive` alone in `server/services/lists.ts`. The module registers `custody.kinds` (`digital-asset`) and `lists`.
  - A new server hook, `lookups`: a module adds a picker to `/api/lookups`, after the assets module's own. The digital asset types use it, so the response keeps its keys and their order.
  - The seed's digital part is `seedDigitalAssets`, called where it was, in the same transaction, so the demo data is unchanged.
- [x] 10.4 d. Web
  - The page is `web/routes/route.tsx` (route id `/_app/digital-assets` unchanged), with `digital-parts.tsx`, the queries, the export (`order: 20`), the types editor and the nav page. The forms read `/api/lookups` through `digitalLookupsQuery` (the same query key, typed `DigitalLookups`).
  - The seats in What they hold are an `employee.holdings` slot entry, after the physical assets; the sheet itself is only the slot now. `EXPORTS` and `web/src/features/lists/editors.tsx` are gone.
  - Digital assets have no importer, on purpose (an import never issues anything).
- [x] 10.5 e. Tests
  - The digital describe of `api.test.ts` is `digital-assets.test.ts` and its notification test `notifications.test.ts`; the export check moved with the export. `_legacy`'s manifest test follows.
- [x] 10.6 f. README
  - `modules/digital-assets/README.md`; the assets README names the `lookups` hook.
- [x] 10.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` paths), route smoke 119/119, schema drift clean, `quick-check.sh` passes. In a browser, What they hold lists the physical then the digital assets, the nav, the Lookup lists page and the Export tab keep their order, and the add and edit forms list the types. `_legacy` has no digital assets left.

Also: digital asset types, the registered custody kind `digital-asset` (employee only), the issue sheet, the page in the Assets workspace, the `assets` resource shared with physical assets, and the digital parts of importers, exports and lists.

### Phase 11 - `tasks`
- [x] 11.1 a. Schema
  - `tasks`, `task_events`, `task_attachments` and `task_attachment_data` moved to `modules/tasks/server/schema.ts`, names, indexes and checks unchanged. No migration.
- [x] 11.2 b. Shared
  - `tasks.ts` (with its test) moved; the constants, schemas, types (with `AccountRef`) and permission rules moved out of `shared/{constants,schemas,types,permissions}.ts`. `BODY_HTML_MAX` is now exported from `shared/schemas.ts` for it.
  - The manifest holds the `tasks` resource (`order: 50`, the only one with Assign) and the eight `task_*` kinds (none an employee kind), taken out of `_legacy`'s, which now declares no notification kinds. `routePrefix` is `''`.
  - `PermissionResource` gained `aboutAccounts`: the employees module reads it to leave Employee Tasks out of "sees every workspace". The access form's Assign message is built from the registry (its text is unchanged).
- [x] 11.3 c. Server
  - `service.ts`, `routes.ts`, `files.ts` and `seed.ts` moved (`git mv`). The module mounts `/tasks` and `/me/tasks` and runs the `tasks.clock` job, both out of `_legacy`. `server/seed.ts` calls `seedTasks` in its old place.
- [x] 11.4 d. Web
  - The seven route files are in `web/routes/` under their old names, so `/me/tasks` nests under the kernel's `me.tsx` by path; route ids and paths unchanged. The parts, `queries.ts` (out of `web/src/lib/queries.ts`), the workspace (rail `order: 30`) and the three nav pages (My tasks on Home at `order: 10`) are the module's own.
- [x] 11.5 e. Tests
  - `tasks.test.ts` moved next to the code; the tasks describe of `shared/permissions.test.ts` is `modules/tasks/shared/permissions.test.ts`. The website registry test's nav clash is now between `_legacy` and `tasks`.
- [x] 11.6 f. README
  - `modules/tasks/README.md`.
- [x] 11.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` paths), route smoke 119/119, schema drift clean, `tasks-smoke.mjs` and `quick-check.sh` pass. In a browser (Priya and Rosa), the rail and the Home panel keep their order, Assign task is locked below Assign, and no console errors. `_legacy` has no tasks left.

Also: events and attachments. The task clock job. The Employee Tasks workspace, plus My tasks pages contributed to Home (URLs under `/me` unchanged). The Assign level, which only this resource offers. Task notification kinds.

### Phase 12 - `grievances`
- [x] 12.1 a. Schema
  - The seven grievance tables and `grievance_audit_log` moved to `modules/grievances/server/schema.ts`, names, indexes and checks unchanged. No migration.
- [x] 12.2 b. Shared
  - The constants, schemas, types and the owner rule (`canManageGrievance`) moved out of `shared/{constants,schemas,types,permissions}.ts`. What Grievances and Reviews share is now the kernel's Records vocabulary: `entryCode`, `RECORD_TITLE_MAX`, `RECORD_SHORT_DESCRIPTION_MAX`, `RECORD_NOTE_MAX`, `recordNote`, `recordReasonSchema`, `entryText`, `occurredAt` and the `RecordPerson`/`RecordEntry`/`RecordAttachment` types, so the kernel never names the module.
  - The manifest is `confidential` with the `grievances` resource (`order: 20`), taken out of `_legacy`'s. `routePrefix` is `/grievances`.
- [x] 12.3 c. Server
  - The routes, the six services, the audit writer, the file reader and the seed moved (`git mv`). The module mounts `/grievances` and answers `employee.references`, both out of `_legacy`. It sits before `_legacy` in `FEATURES`, so the route and hook orders are unchanged.
- [x] 12.4 d. Web
  - The eleven route files are in `web/routes/` under `/grievances`, the case file in `web/print/` (mounted at the root, out of `vite.config.ts`'s `_legacy` branch). The parts, `queries.ts` (with the Grievance Audit Log's, out of `web/src/lib/queries.ts`), the workspace (rail `order: 50`) and its four nav pages are the module's own. The common parts and the Reviews pages use the Records names.
  - Left for 14.2: `list-parts.tsx`'s `'grievances/categories'` list kind and the `RECORDS` map in `files.tsx`.
- [x] 12.5 e. Tests
  - `grievances.test.ts` moved next to the code; its source scan now reads every server folder (kernel, foundation, modules), and the grievance half of `shared/permissions.test.ts` is `modules/grievances/shared/permissions.test.ts`. The website registry test's confidential-badge check uses the module's workspace.
- [x] 12.6 f. README
  - `modules/grievances/README.md`.
- [x] 12.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` paths), route smoke 119/119, schema drift clean, `sidebar-smoke.mjs` and `quick-check.sh` pass. In a browser (Priya and Marcus), Grievances stays last on the rail with no count, its panel keeps its four pages and the Administration heading, every page and the case file render, and no console errors. `_legacy` has no grievances left.
  - The built CSS had lost `.lowercase` since Phase 9: it came only from a comment in a `.ts` file that moved into a module, and the module `@source` globs took `.tsx` only. They now take `.{ts,tsx}`, as `web/src` is scanned, and the CSS matches the Phase 0 baseline again.

Also: `confidential: true`. Its own audit log, versions, entries, people, attachments and categories (as a lookup list). The case-file print page mounted at the root. Exports. The owner rules (`serviceDecides`).

### Phase 13 - `reviews`
- [x] 13.1 a. Schema
  - The five review tables and `review_audit_log` moved to `modules/reviews/server/schema.ts`, names, indexes and checks unchanged. No migration. `server/db/schema.ts` now holds only `users` and `sessions`.
- [x] 13.2 b. Shared
  - The constants, schemas, types and the reviewer rule (`canManageReview`, `reviewManageReason`) moved out of `shared/{constants,schemas,types,permissions}.ts`, built on the kernel's Records vocabulary; the Audit Log query schema they extend comes from `audit`'s public API. `openReviewWork` (the "is reviewing" wording on the employee list) moved to `foundation/employees/shared/figures.ts`, so the foundation never imports the module.
  - The manifest is `confidential` with the `reviews` resource (`order: 40`) and its R9 `available` rule, taken out of `_legacy`'s, which now declares no resources. `routePrefix` is `/reviews`.
- [x] 13.3 c. Server
  - The routes, the five services, the audit writer, the file reader and the seed moved (`git mv`). The module mounts `/reviews` and answers `employee.references`, both out of `_legacy`, whose server module is now its manifest alone. It sits right after `grievances` in `FEATURES`, so the route and hook orders are unchanged.
- [x] 13.4 d. Web
  - The eleven route files are in `web/routes/` under `/reviews`, the case file in `web/print/`; `vite.config.ts` has no `_legacy` print branch left. The parts, `queries.ts` (with the Review Audit Log's; `web/src/lib/queries.ts` keeps only `meQuery`, `usersQuery` and `refreshData`), the workspace (rail `order: 40`) and its four nav pages are the module's own.
  - Left for 14.2: the `RECORDS` map in `files.tsx`, which takes `reviewCapCode` from the module's index until then.
- [x] 13.5 e. Tests
  - `reviews.test.ts` moved next to the code, and the review half of `shared/permissions.test.ts` is `modules/reviews/shared/permissions.test.ts`; `manifest.test.ts` checks the confidential flags and the R9 rule. The source scan in `grievances.test.ts` reads the module's own folder for the Review Audit Log writer.
- [x] 13.6 f. README
  - `modules/reviews/README.md`.
- [x] 13.7 g. Check
  - API snapshot (95 files) and access matrix compare clean (only the refused `__undeclared__` paths), route smoke 119/119, schema drift clean, `sidebar-smoke.mjs` and `quick-check.sh` pass, and the built CSS matches the Phase 0 baseline. In a browser (Priya and Marcus), Administrative Reviews stays just before Grievances on the rail with no count, its panel keeps its four pages and the Administration heading, every page (a CAP and its edit page included) and the case file render, and no console errors. `_legacy` has no reviews left, and no resources at all.

Also: `confidential: true`. CAPs, entries, its own audit log and attachments. The R9 availability rule on its resource. The case-file print page. The reviewer rules (`serviceDecides`).

## Phase 14 - Cleanup

- [x] 14.1 Delete `modules/_legacy/`. Make sure `server/services`, `server/routes` and `web/src/features` hold only kernel code (or are gone), and that `server/db/schema.ts` holds only `users` and `sessions`.
  - `modules/_legacy/` is gone. `server/services` and `server/routes` hold only auth, users, imports and lists; `web/src/features` is gone; `server/db/schema.ts` holds only `users` and `sessions`.
- [x] 14.2 Shrink `shared/constants.ts`, `schemas.ts` and `types.ts` to kernel-only content. Move `web/src/features/common/*` into kernel components. Delete `web/src/lib/queries.ts` and the hand-kept maps (`WORKSPACE_HOME`, `IMPORTERS`/`EXPORTS` literals).
  - `shared/constants.ts`, `schemas.ts` and `types.ts` keep only kernel content; `web/src/lib/queries.ts` and the hand-kept maps are gone (the registries give workspaces, importers and exports).
- [x] 14.3 The kernel test kit (`server/testing/`) replaces `server/tests/helpers.ts`. Only kernel tests remain under `server/tests/`.
  - `#kernel/testing/index.ts` (`setup()`) replaced `server/tests/helpers.ts`. `server/tests/` keeps access, admin-cli, api and notification-events: they test the kernel across modules, so they stay there.
- [x] 14.4 `docs/verify/new-module-proof.sh` passes: the extensibility proof from the Definition of Done.
  - `docs/verify/new-module-proof.sh`: RESULT: PASS, 11 checks. The tests that pin today's modules use `expectToday` (`shared/testing.ts`), so a new module changes none of them.
- [x] 14.5 Switch on boundary rule (f): kernel code imports a feature module only through the generated registries (Decisions, Boundaries). Fix or move any kernel import it finds.
  - Rule (f) is always on (the `KERNEL_RULE` flag is gone). Seeds run from each module's `seed` hook with a `SeedKit` (`server/modules.ts`); the Issue and Return sheets come from the `app.overlays` slot and their lookups from `preload`; the Users page uses `employeesQuery`. Baselines compare clean, route smoke 119/119, `verify-done.sh` fails only the plan and issue-block lines.

## Phase 15 - Generator and guide

- [x] 15.1 `bun run new-module <name> [--foundation]`: scaffolds from templates in `scripts/templates/module/` (manifests, schema, service, route with `requires`, shared types, a page and nav entry, queries/api, a test, a README with the required sections), adds the `app.modules.ts` line and runs `modules:gen`.
  - Templates are `.tmpl` files (`<file>.<tier>.tmpl` where the tiers differ); the generator refuses ids that aren't kebab-case, are taken, are kernel paths or clash with a table, and has its own unit test. `new-module-proof.sh` now runs it: both tiers PASS (11 checks each). The kernel's pinned-list tests use `expectToday`, so a new module needs no edit there. Found and fixed on the way: a switched-off module's grants made the Users page's Change access fail (422); the API now leaves them out and a save keeps them (`accessOn`, `keepSwitchedOff`, test in `server/tests/api.test.ts`).
- [x] 15.2 `docs/modules.md`: how to add, change, depend on, switch off and remove a module; tiers and boundaries; hooks and slots with examples; permissions; migrations; seeds; tests; the confidential rule.
  - Rewritten in full: tiers, layout, add (`new-module`), change, depend on, boundaries (a)–(f), server hooks and web slots with examples (`app.overlays`, `preload`), pages, permissions, switch off/on and what happens to the data (gone in 17.2a), remove, seeds (`SeedKit`), tests (`expectToday`), order, and the rules that never bend. The `_legacy` recipe is gone.

## Phase 16 - Documentation, and keeping it current

Every doc must describe the code and the app as they actually are, for people and for future Claude sessions alike.

- [x] 16.1 `docs/architecture.md`: kernel, foundation and feature tiers; the request path (registry, route declarations, access, service, database); the registry and generator; the boundaries and what enforces them; custody; permissions as resources; a generated module table (id, tier, dependencies, resources, workspaces, jobs) between marker comments, written by `bun run docs:gen`.
  - `docs/architecture.md`: tiers, the registry, a request start to finish, how modules work together (hooks and slots), boundaries and what enforces them, permissions as resources, custody, data and migrations. The module table (also on, confidential) sits between the markers, written by `bun run docs:gen` (`scripts/docs-gen.ts`; it runs under tsx with the web tsconfig, so it can load each `web/module.ts`).
- [x] 16.2 `CLAUDE.md`: an Architecture section (where code goes, tiers, public-API rule, hooks, `new-module`, `modules:gen`), new TOOLS (`modules:gen`, `new-module`, `docs:check`, the baseline scripts), GOTCHAS learned during the refactor, and a rule that **every change updates the docs it makes stale, in the same PR**.
  - New ARCHITECTURE section; TOOLS gains `modules:gen`, `new-module`, `docs:gen`/`docs:check`, the baseline and verify scripts and the demo accounts; WORKFLOWS gains the docs rule (`docs:check` in CI); the lasting gotchas moved from the #23 block into GOTCHAS. `check-agentsmd.sh CLAUDE.md 23 active` passes. What stays for good is the user's call at 17.4a.
- [x] 16.3 `README.md`: Project layout, Run it locally, Formatting/Linting (boundary rules), What it does and Rules the system enforces checked against the modules.
  - Layout, running it, the checks, boundary rules (a)–(f), and what it does and the rules it enforces, each with the module that owns it. Found and fixed on the way: `FEATURES` listed maintenance after reviews, so refusing to delete an employee named the review first, unlike before the split. `FEATURES` now has maintenance before reviews (registries, the table and the pinned orders in `server/registry.test.ts` follow), and `server/tests/api.test.ts` ("what keeps an employee") pins the message; it failed on the old order.
- [x] 16.4 `RUNBOOK.md` and `DEPLOY-GUIDE.md`: the deploy with backup and migration check; switching a feature module off and on; what happens to a disabled module's data; restoring if a migration fails.
  - RUNBOOK §7: the upgrade (note the commit, off-box backup, a `previous` image tag, build, rehearse, `up -d`, check pages), 7.1 the 0024 rehearsal, 7.2 a failed migration (rolled back in its transaction: old image, no restore), 7.3 rollback, 7.4 switching a module off or on and what happens to its data, grants and the Zoho webhook (401 while off); 7.4 is gone in 17.2a. DEPLOY-GUIDE step 13 the same for the VPS. Job names, log lines, image contents, `KEEP` and the seed guard checked against the code.
- [x] 16.5 `PRODUCT.md`, `DESIGN.md` (navigation built from manifests), `TODO.md` (improvements found during the refactor, with issue links), `design-qa.md` and `brand-assets/README.md`: each checked against the code and fixed where stale.
  - PRODUCT: access by section and the kernel/modules sentence. DESIGN: where the rail and nav entries come from. TODO: the #23 entry and the follow-ups (#14 `home.widgets`, finer resources with #21, the unused `reports` hook and `employee.detail` slot, the access form's order). design-qa and the brand-assets README: small fixes. Module READMEs fixed too: employees (slots), maintenance (order), grievances (an owner needs Read Only or more), assets (one brand stays active).
- [x] 16.6 `bun run docs:check` in the CI `test` job and in `verify-done.sh`. It fails when a module lacks its README or a required section, when the generated module table is stale, or when a file path quoted in any Markdown doc no longer exists.
  - `scripts/docs-check.ts` (tests in `docs-check.test.ts`): required README sections (the list `new-module`'s test now shares), the table's staleness, and every repo path a tracked Markdown doc quotes (links, and code spans that look like paths; plans and handoffs skipped; history is quoted as `git show <commit>:<path>`). In the CI `test` job after Module registries, and in `verify-done.sh`. `new-module` prints the `docs:gen` step.
- [x] 16.7 `.github/pull_request_template.md` with a "Docs updated, or none made stale" checkbox.
  - What and why, How it was checked, and a checklist that includes "Docs updated, or none made stale" (`bun run docs:check` passes).
- [ ] 16.8 After the merge, with the user's OK: update the file paths in the bodies of the waiting issues (#14, #17, #18, #21, #22) to the new layout, and refresh the Claude project memory's description of the architecture.
  - Waits for the merge and the user's OK.

## Phase 17 - Verify and ship

- [ ] 17.1 `docs/verify/verify-done.sh` exits 0, with its output shown.
  - At 7f5a005: 18 PASS (baselines, route smoke, migration check, extensibility proof and docs:check among them); "every plan slice ticked" and "issue #23 block removed" fail until 17.3–17.5 and 16.8. CI green on 7f5a005.
  - Before the PR (after 17.2a and 17.4a): 19 PASS; only "every plan slice ticked" fails, on the after-merge slices 16.8, 17.1, 17.4 and 17.5.
- [x] 17.2 Final rehearsal: 7.5 again with all phases in place.
  - `KEEP=<dir> node docs/verify/migration-check.mjs`: 18 PASS (row counts in 36 tables, 145 physical ids kept, 28 digital ids after 150, conditions 330, audit 421, notifications 18, foreign keys, integrity, the guards); the route smoke on the migrated copy passed 119/119.
- [x] 17.2a No switching off (the user's decision, Oct 23 2026; Decisions, Switches): every module is always installed, and removing one is a single change.
  - `modules:gen` refuses a feature folder `FEATURES` leaves out (two new cases in `gen-modules.test.ts`); the "disabled dependency" check, the unused `isEnabled` in `shared/registry.ts` and the On column of the `docs:gen` table are gone.
  - `accessOn`/`keepSwitchedOff` are `declaredAccess`/`keepUndeclared`: a removed module's grants stay in `users.access`, hidden by the API and kept on save (`server/tests/api.test.ts`). "Enabled module" wording in code, error strings and tests is now "module".
  - Docs: RUNBOOK 7.4 and every link to it, the switch-off parts of `docs/modules.md`, `docs/architecture.md`, `DEPLOY-GUIDE.md`, README, PRODUCT, CLAUDE.md and the tier READMEs; "Remove a module" in `docs/modules.md` is one change. The grievances and reviews READMEs name their place around `maintenance` in `FEATURES`.
- [x] 17.3 User confirms the manual DoD items.
  - Confirmed by the user on Oct 23 2026: the migration-check output, the walk through the app at desktop and phone width on the :3388 scratch server, and the docs.
- [x] 17.4a Remove the `byte-gh-do-issue #23` block from `CLAUDE.md`, keeping only what the user approves in its permanent sections (`check-agentsmd ... clean` passes).
  - The user approved the permanent sections as they stand (ARCHITECTURE, TOOLS AND COMMANDS, WORKFLOWS, GOTCHAS, written in 16.2 and 17.2a); nothing else from the block was kept.
- [ ] 17.4 With the user's permission, squash the branch and open the PR from `refactor/issue23-modular-architecture` (squash-merge). After the merge, deploy per `RUNBOOK.md`: back up production first, deploy, check the health endpoint and the route smoke against production read-only pages.
  - Squashed and opened as a PR on Oct 23 2026 with the user's permission. The deploy waits for the user's OK after the merge, so the box stays open until then.
- [ ] 17.5 Follow-ups as new issues: fine-grained permission resources (paired with #21), and any big improvement recorded in `TODO.md`.
