---
description: Change a table, column or index, generate the drizzle migration, check for schema drift and rehearse the migration before it ships
scope: root
covers: [migration, database, schema, drizzle, drizzle-kit, db-generate, schema-drift, sqlite, migration-check, rehearse, runbook, release-notes]
---

# Add a database migration

1. Edit the schema file that owns the table: `server/db/schema.ts` for the kernel, `foundation/<id>/server/schema.ts` or `modules/<id>/server/schema.ts` for a module. drizzle-kit reads only those files (`drizzle.config.ts`). A table defined anywhere else is invisible to it, and moving one out of them shows up as a drop.
2. Generate the migration: `bun run db:generate --name <what_changed>`. It writes the next numbered `.sql` file and a snapshot under `server/db/migrations/`.
3. Read the SQL. Look for drops, table rebuilds and anything that could lose rows. Migrations only go forward and never delete history (`docs/directives/audit-and-history.md`).
4. Check that schema and migrations agree: `docs/verify/schema-drift.sh` must print `PASS`.
5. Run the tests: `docs/verify/quick-check.sh`. The test kit builds an in-memory database from every migration.
6. Rehearse on realistic data. Start the scratch server (`docs/verify/scratch-server.sh start`), which seeds and migrates a fresh database, then open the affected pages. For a change that rebuilds or merges tables, restore a copy of a real backup into a scratch volume and start against it (`RUNBOOK.md` section 5.3). `docs/verify/migration-check.mjs` covers migration 0024 only; later migrations have no check of their own, so the scratch-volume restore is their rehearsal.
7. Add a release note to `RUNBOOK.md` section 7: the file name, what changes for users, and "Take the same backup first". Update the module's README "Tables" section.
8. Commit the schema change, the `.sql` file and the `meta/` snapshot together.

Deploying it is `how-tos/upgrade-production.md`.
