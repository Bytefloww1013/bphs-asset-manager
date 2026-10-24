---
description: How to add, change, depend on and remove a module - layout, boundaries, server hooks, web slots, pages, permissions, seeds, tests, registry order and the rules that never bend
scope: root
covers: [modules, new-module, layout, dependsOn, boundaries, imports, public-api, server-hooks, web-slots, pages, permissions, seeds, tests, order, FEATURES, manifest, remove-module]
---

# Modules

The app is a kernel plus modules. This guide says how to add one, change it, make it depend on another and remove it, and which rules each kind of code follows.

## Tiers

- **The kernel** is `server/`, `web/src/` and `shared/`: sign-in and sessions, accounts and access, the module registry, the route declarations, lookup lists, import/export, and the app shell. It knows modules only through the generated registries.
- **Foundation modules** are in `foundation/<id>/`: employees, programs, assignments (the custody ledger), audit and notifications. They never depend on a feature module, and `app.modules.ts` doesn't list them.
- **Feature modules** are in `modules/<id>/`: assets, digital-assets, grievances, maintenance, reviews and tasks. Each has its line in `FEATURES` (`app.modules.ts`), which sets the registry order; `modules:gen` refuses a folder the list leaves out. Every module is always installed: there is no switching one off.

A module's id is its folder name, in kebab-case. `bun run modules:gen` reads every manifest and writes the registries (`shared/modules.gen.ts`, `server/modules.gen.ts`, `web/src/modules.gen.ts`): foundation first, then `FEATURES` in its order, each module after the ones it depends on. The dev server runs it whenever a manifest, a `module.ts` or `app.modules.ts` changes; `bun run modules:gen --check` fails when a registry is stale.

## Layout

```
modules/<id>/
  README.md            what it does: Tables, Resources and rules, Hooks, Public API, Pages, Gotchas
  shared/manifest.ts   defineSharedManifest: id, tier, label, dependsOn, confidential, resources, notification kinds, audit types, routePrefix
  shared/index.ts      public API, shared side: constants, types and schemas other modules need
  server/schema.ts     its tables
  server/module.ts     defineServerModule: schema, routes, webhooks, jobs, startup, seed, hooks
  server/index.ts      public API, server side
  server/*.test.ts     its tests, next to its code
  web/module.ts        defineWebModule: workspaces, nav, slots, exports, importers, lists, preload
  web/index.ts         public API, website side
  web/queries.ts       its React Query options, keyed under its own resource or id
  web/api.ts           its writes, each a function over `api` that a page runs through `useWrite`
  web/routes/          its pages, mounted at the manifest's routePrefix
```

The contracts are `shared/modules.ts` (the manifest), `server/modules.ts` (the server module, its hooks and the seed kit) and `web/src/modules.ts` (the web module and its slots). Each field is documented there.

## Add a module

```bash
bun run new-module kiosk-loans
```

It writes the new folder, `modules/<id>/` (here `kiosk-loans`), from `scripts/templates/module/`: a manifest with one workspace resource, a table, a service that audits each write, routes behind `requires`, a page with a quick-add form, its queries and writes, a test and a README. It adds `'kiosk-loans'` to the end of `FEATURES`, formats what it wrote and runs `modules:gen`. `--foundation` writes `foundation/<id>/` instead: always on, with a resource but no workspace, so a feature module lists its page in its nav (as Assets lists Employees). It refuses an id that isn't kebab-case, that a module already has, that is one of the kernel's own paths (`users`, `login`, `lookups` and the rest), or whose table name another module's schema already uses.

Then, as it prints:

1. `bun run db:generate --name kiosk_loans` writes the migration that makes its table. Read it before committing.
2. `bun run dev` writes the route tree (`web/src/routeTree.gen.ts`); the page is at `/kiosk-loans`. Until the route tree is written, `bun run typecheck` doesn't know the page's route.
3. Fill in the README and the manifest's comment.
4. `bun run docs:gen` adds it to the module table in `docs/architecture.md`; `bun run docs:check` (in CI) fails until it does, and fails while the README lacks a required section.

`docs/verify/new-module-proof.sh` runs the whole path (`TIER=foundation` for the other tier): scaffold, migrate, build, lint, typecheck, test, the route smoke, then it takes the module out again and checks every other file is as it was.

## Change a module

- **Inside a module, use relative paths** (`../shared/constants.ts`).
- **The kernel** is `#kernel/…` on the server (`#kernel/db/client.ts`, `#kernel/http.ts`, `#kernel/access/route.ts`, `#kernel/lib/errors.ts`) and `@/…` or `@shared/…` on the website. The server runs `.ts` under Node type stripping, so it can't use Vite's `@/` alias.
- **A manifest imports only `#shared/modules.ts` and `#shared/levels.ts`.** `shared/constants.ts` and `shared/permissions.ts` read the registry as they load, so a manifest that imports either is an ESM cycle and fails to load. The module's other shared files may use the kernel's helpers (`requiredText`, `optionalText` and `calendarDate` from `#shared/schemas.ts`).
- **A kernel helper you need that isn't exported**: export it from the kernel; don't copy it. A helper several modules use belongs to the foundation module it is about (`requireActiveEmployees` is in employees).
- **A new table, column or index** goes in its `server/schema.ts`, then `bun run db:generate --name <what>`. There is one migrations folder for every module (`server/db/migrations/`); drizzle-kit reads `server/db/schema.ts`, `foundation/*/server/schema.ts` and `modules/*/server/schema.ts` (`drizzle.config.ts`). Migrations run at every start. `docs/verify/schema-drift.sh` fails when the schema and the migrations disagree.
- **Moving code between files or modules**: move it first (`git mv`), then reshape it, in the same commit, so `git blame -C -C` can follow it.

## Depend on another module

1. Name it in the manifest's `dependsOn`. `modules:gen` puts it first, and refuses an unknown or cyclic dependency, and a foundation module that names a feature module.
2. Import only its public API: `#foundation/employees/server/index.ts`, `…/shared/index.ts` or `…/web/index.ts` (`#modules/<id>/…` for a feature module). Put these imports first.
3. To give a foundation module something (what an employee holds, a kind of custody), answer one of its hooks instead of having it import you: see below.

## Boundaries

`bun run lint` enforces them as one rule, `boundaries/imports` (`scripts/oxlint-boundaries.ts`). It resolves each import, `export … from` and `import()` to a repo path, so a relative path out of a module is caught as well as a `#…` one. It refuses:

- (a) web code importing server code;
- (b) a foundation module importing a feature module;
- (c) code outside a module importing anything of it but `<side>/index.ts` (the generated registries may import manifests and `module.ts` files);
- (d) shared code importing server or web code;
- (e) a confidential module importing `foundation/notifications`;
- (f) kernel code importing a feature module, except through the generated registries.

## Server hooks

The questions the kernel and the foundation modules ask every module (`ServerHooks` in `server/modules.ts`). A module answers in its `server/module.ts`; the asker reads every answer with `hooks('<name>')` (`#kernel/registry.ts`), in registry order.

| Hook | Asked by | An answer gives |
|---|---|---|
| `employee.references` | employees | an employee's row figures, and what blocks deleting or archiving them |
| `program.references` | programs | the same for a program |
| `custody.kinds` | assignments | a kind of item the custody ledger holds (`asset`, `digital-asset`) |
| `lists` | the kernel | a list on the Lookup lists page, mounted at `/api/<path>` |
| `lookups` | assets | one more picker in `/api/lookups` |
| `importers` | the kernel | how an importer's rows are stored |
| `reports` | nobody yet | a report or dashboard figure |

From `modules/assets/server/module.ts`:

```ts
hooks: {
  'employee.references': [conditionEmployeeReferences],
  // Physical first: an employee holding both is told about the assets first, as today.
  'custody.kinds': [assetCustody],
  lists: [assetTypeList, assetBrandList, conditionRatingList],
},
```

The order of the answers is the registry's. Only `employee.references` shows it to anyone: the first blocker found is the one given.

A server module may also have:

- `routes: [{ base, create }]`, mounted at `/api<base>` behind the session check. Every route's first handler is its access declaration (see Permissions); `createApp` throws on a route without one, and a path no route declares is a 404.
- `webhooks: [{ base, create }]`, mounted at `/api/webhooks<base>` before the session check. It has no session, so it checks its own secret (maintenance's mounts at `/maintenance`). A secret the kernel reads from the environment stays in `server/config.ts`.
- `jobs: [{ name, every, atStart?, run(db) }]`: work on a timer, `every` milliseconds. A run that throws is logged, and stops neither the other jobs nor the server.
- `startup(db)`: runs at every start, after the migrations, in registry order: default rows and other upkeep (assets' `ensureDefaultLists`).
- `seed(db, kit)`: see Seeds.

## Web slots

The places in the kernel's and foundation modules' pages where other modules draw (`SlotProps` in `web/src/modules.ts`). A module lists its components under `slots`; the page draws them with `<Slot name="…" props={…} />` (`web/src/components/slot.tsx`), in registry order, each only for the accounts its `visible(user)` lets in.

| Slot | Where | Props |
|---|---|---|
| `employee.detail` | an employee's detail | `{ employeeId }` |
| `employee.actions` | beside an employee's More actions menu | `{ employee }` |
| `employee.holdings` | an employee's "What they hold" sheet | `{ employee }` |
| `program.actions` | beside a program's More actions menu | `{ program }` |
| `home.widgets` | Home (`/me`) | none |
| `app.overlays` | once beside every page of the app | none |

`app.overlays` is for the sheets a module opens from the address, on any page. From `modules/assets/web/module.ts`, with `preload`, which fetches what they need before the app opens, for this account:

```ts
slots: {
  'employee.actions': [{ id: 'assets.issue', component: IssueToEmployee }],
  'app.overlays': [
    { id: 'assets.issue-sheet', component: IssueSheet, visible: issues },
    { id: 'assets.return-sheet', component: ReturnSheet, visible: issues },
  ],
},
// The sheets' pickers, fetched once, up front, for an account that can open Assets.
preload: (queryClient, user) =>
  canUseWorkspace(user, 'assets') ? queryClient.ensureQueryData(lookupsQuery) : undefined,
```

A web module may also have `workspaces` (a place on the rail: id, label, icon, home, order, groups), `nav` (its pages in a panel: a workspace's, or Home's with `workspace: 'me'`), `exports` (the Export tab), `importers` (the Import tab; the server registers each one's store through the `importers` hook) and `lists` (an editor on the Lookup lists page).

## Pages

A module's `web/routes/` mounts under the app layout at its manifest's `routePrefix` (`vite.config.ts`), and its `web/print/` at the root, outside the layout. File names are relative to that mount: `route.tsx` is the prefix's layout, and `index.tsx`, `new.tsx` and `$id.tsx` are its pages. The `createFileRoute('…')` id keeps the full path, as in `createFileRoute('/_app/maintenance/$id')`. Tailwind scans `modules/*/web/**` and `foundation/*/web/**` through the `@source` lines in `web/src/styles.css`; a new tier folder needs its own line.

Data: `web/queries.ts` holds its `queryOptions`, keyed under its own resource or id (never `me`, which `refreshData` leaves alone). `web/api.ts` holds its writes; a page runs each through `useWrite` (`@/lib/hooks.ts`), which refreshes every query after it.

## Permissions

- **A resource** is something an account is given a level in on the Users page (`resources` in the manifest): its key in `users.access`, label, levels (`none` first), one line of help for each level, and an optional hint. `modules:gen` refuses a level without help, and help for a level it doesn't offer. `workspace: true` gives it a place on the rail; its `order` places it on the access form (workspaces are 10 Assets, 20 Grievances, 30 Maintenance, 40 Reviews, 50 Tasks). `available(user)` takes it away from some accounts whatever they were given (Reviews, from an account that is nobody).
- **On the server**, each route declares its access first (`#kernel/access/route.ts`): `requires(resource, level)`; `serviceDecides(resource)`, where Read lets the request in and the service decides the rest; `open()`, any signed-in account; or `superAdmin()`.
- **On the website**, `canAt(user, resource, level)` (`@shared/permissions.ts`) decides what to show, and `useDenied(resource, level)` (`@/lib/session.ts`) gives the reason a control is off. A feature workspace's pages turn away accounts without Read through the shell; a foundation module's page (it has no workspace) needs its own `beforeLoad` check, as the Employees page has.
- **Super Admin** is Full in every resource, including any added later. An account not given a level in a resource is None in it, so a new module starts closed to everyone but Super Admins.

## Remove a module

One change removes it: delete its folder and its line in `FEATURES`, then run `bun run modules:gen`. If another module depends on it, `modules:gen` refuses (`depends on "<id>", which doesn't exist`) and lint flags the imports: change those first. Deleting the folder is a schema change: `bun run db:generate` writes a migration that drops its tables. Back up first (`bun run db:backup`), read that migration, and keep any rows you need before it runs; deploy it like any upgrade, rehearsing on a copy of the backup (`RUNBOOK.md` section 7).

Its audit entries and the notifications it sent stay, labelled by their stored type (the Inbox shows a kind no module declares as "Notification"). The access accounts had in it stays in `users.access`, where the API leaves it out and a save keeps it; add a `json_remove` to the migration if you want it gone. Run `bun run docs:gen`, and update the docs that name it in the same change (`bun run docs:check` finds the paths that are gone).

## Seeds

`bun run db:seed` (`server/seed.ts`) makes the demo data: the employees and accounts first, then each module's `seed(db, kit)`, in registry order. It returns what it added for the summary line (`116 physical assets`). The kit (`SeedKit` in `server/modules.ts`) shares one random sequence, a clock and an audit writer with every module, so the demo comes out the same each time: draw from `kit.rand` (`int`, `pick`, `daysAgo`) and take the time from `kit.now`, never from `Math.random()` or `Date.now()`. A module that needs the programs calls `kit.programs(tx)`. Load the seed's code only when seeding, as assets does:

```ts
seed: async (db, kit) => `${(await import('./seed.ts')).seedAssets(db, kit)} physical assets`,
```

## Tests

- A module's tests are next to its code (`server/*.test.ts`). `bun run test` runs them all; `bunx vitest run <path>` runs one file.
- The server kit is `#kernel/testing/index.ts`: `setup()` gives an in-memory database with every migration, the modules started, the app, and `call(method, path, { cookie, body })`, `asSuper()`, `asAdmin()`, `signInAs(access)` and `addUser()`. The generated module's test shows the pattern.
- The kernel's tests that pin today's lists (`shared/registry.test.ts`, `server/registry.test.ts`, `web/src/registry.test.ts`) use `expectToday` (`shared/testing.ts`): today's entries must be there, in order, and the entries a new module adds are left out. So adding a module needs no edit to them; changing what an existing module declares does.
- A test that calls `vi.resetModules()`, and a new entry point, must call `installModules(...)` first, or every registry reader throws.

## Order

The registry lists modules foundation first, then `FEATURES` in its order, each after the modules it depends on. Hook answers, slots, routes, jobs, nav pages with the same `order` and workspaces with the same `order` all follow it.

## Rules that never bend

- **Grievances and Reviews are `confidential`.** They never notify and never show a count. `modules:gen` refuses a confidential module's notification kinds, lint rule (e) its notification imports, and a confidential workspace never has a badge. Write `confidential: true` as a literal: rule (e) reads the manifest file.
- **Every API route declares its access first.** `createApp` throws on a route that doesn't, and a path no route declares is a 404.
- **Nothing from inside a workspace is stored in the browser.**
