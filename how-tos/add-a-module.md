---
description: Scaffold a new feature or foundation module, generate its migration and route tree, document it and prove it needs no kernel edit
scope: root
covers: [new-module, module, feature, foundation, scaffold, manifest, registries, modules-gen, migration, route-tree, readme, docs-gen, docs-check, routes-smoke, new-module-proof, confidential]
---

# Add a module

Rules for what goes in a module are in `docs/modules.md` ("Add a module", "Boundaries") and `docs/architecture.md`.

1. Scaffold it: `bun run new-module <id>` (kebab-case), or `bun run new-module <id> --foundation` for an always-on module in `foundation/<id>/`. It writes the folder from `scripts/templates/module/`, adds a feature module to `FEATURES` in `app.modules.ts`, and runs `modules:gen`. Its printed next steps are steps 2, 3, 6 and 7 below.
2. Write its migration: `bun run db:generate --name <table>`. Read the new SQL file in `server/db/migrations/` before committing (see `how-tos/add-a-db-migration.md`).
3. Write the route tree: start `bun run dev` once, so that `web/src/routeTree.gen.ts` picks up the page. Until then, `bun run typecheck` doesn't know the route.
4. Add each new page path to `ROUTES` in `docs/verify/routes-smoke.mjs`. For a page some accounts may not open, also add an `EXPECT` entry. Otherwise the smoke fails with `not in ROUTES: <path>`.
5. A confidential module (HR data, like Grievances or Reviews) also follows `docs/directives/confidentiality.md`.
6. Fill in `modules/<id>/README.md` (or `foundation/<id>/README.md`): keep its required sections (Tables, Resources and rules, Hooks, Public API, Pages, Gotchas). Then fill in the comment in its manifest.
7. Run `bun run docs:gen` to add the module to the table in `docs/architecture.md`.
8. Check: `docs/verify/quick-check.sh`, `bun run docs:check` and `docs/verify/schema-drift.sh`, then run the route smoke (`how-tos/run-browser-smokes.md`). Every one must pass.
9. Commit (`quick-check.sh` has already formatted the tree). Nothing outside the module folder, its `FEATURES` line, the generated registries and route tree, the migration, the route-smoke list and `docs/architecture.md` should have changed.

To prove the scaffold itself still works after you change `scripts/new-module.ts` or `scripts/templates/module/`, run `docs/verify/new-module-proof.sh` (and again with `TIER=foundation`). It adds a throwaway module, runs every check on it, then removes it.
