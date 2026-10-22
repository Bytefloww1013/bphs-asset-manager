# Asset Brand, Model and Entra ObjectId (issue #19) - Implementation

Status: in progress | Started: 2026-10-22 | Branch: `feature-asset-brand-model-entra`

Source: [issue #19](https://github.com/Bytefloww1013/bphs-asset-manager/issues/19). Grilling questions were answered from the issue; the gaps were put to the user (answers below).

## Decisions

- **Task:** add **Brand** (required, a **reference list** like Types), **Model** (optional text) and **Entra ObjectId** (optional, **UUID canonical form**, stored lowercase, **partial unique index**) to physical assets, shown between Type and Serial.
  - Full set (Brand, Model, Entra ObjectId) wherever Serial shows today: Physical Assets table (columns, sorting, search), Available, asset detail (`/assets/$tag`), add/edit forms, Quick add (including the paste-from-spreadsheet bulk add), the issue-sheet summary, and every CSV/XLSX export that lists an asset (exports always carry all three).
  - Compact views that show only tag + type (Assignments, Overview, employee and program holdings, the issue-sheet picker) add "Brand Model" next to Type; Entra ObjectId is not shown there.
  - Brands on the Lists page beside Types: add, rename, archive (**soft delete**), **restrict delete** for a brand in use, the last active brand can't be archived or deleted; every change audited (`assetbrand`).
  - Migration **backfills** an **"Unknown"** brand onto every existing asset. Unknown is created **archived**: no picker offers it and the server refuses it on create/update; the edit form shows Brand empty for an asset on an archived brand and requires a choice before saving.
  - Bulk paste columns become: tag, type, brand, model, Entra ObjectId, serial, condition, holder. Brand is matched by name among active brands, like Type; a bad row is reported by number.
  - A first run (no users) gets default brands, as it gets default Types, so the forms work at once.
  - Asset create and update audit entries include the new fields.
  - `server/seed.ts` seeds realistic brands, models and Entra ObjectIds, including assets with no Model or no Entra ObjectId.
- **Out of scope:** digital assets; any Microsoft Graph or Entra sync (the ID is stored only); the employee/program file importer; the colour and logo redesign.
- **Guardrails:**
  - Existing migrations `0000`-`0022` (SQL and snapshots) unchanged; one new migration only.
  - Migration loses no data: every asset keeps its id, tag, type, serial, status and created date; assignments and conditions keep every row and id.
  - Never the real `data/` / DATA_DIR: browser checks on `docs/verify/scratch-server.sh` only.
  - No new dependencies (`package.json`, `bun.lock` unchanged); existing colour tokens in `web/src/styles.css` unchanged.
  - Digital asset files unchanged (`server/services/digital-assets.ts`, `web/src/routes/_app/digital-assets.tsx`, `web/src/features/digital-assets/`).
  - Commit per phase on `feature-asset-brand-model-entra` only. Never commit to `main`, **never push, no PR until the user says so**.
  - CLAUDE.md stays free of branch-specific text.
  - Sub-agents get **disjoint file ownership** (listed on each slice); no two write the same file.
- **Definition of Done - scripted:** `docs/verify/verify-done.sh` exits 0, covering:
  - `bun run typecheck`, `lint`, `format:check`, `test`, `build` exit 0.
  - `server/tests/asset-fields.test.ts` and `web/src/lib/exports.test.ts` exist and run (Brand required, archived brand refused, UUID format, uniqueness incl. case, backfill with no data loss, audit entries, brand restrict delete, bulk paste brand, export column order).
  - A new migration `0023_*` is in the journal; `0000`-`0022` unchanged.
  - A fresh seed has more than one active brand, "Unknown" archived, assets with and without Model and with and without Entra ObjectId, every Entra ObjectId a lowercase UUID.
  - README and RUNBOOK mention Brands and Entra ObjectId.
  - Guardrail diffs clean (digital assets, dependencies, colour tokens); CLAUDE.md has no branch-specific text; nothing pushed.
  - `node docs/verify/asset-fields-smoke.mjs` passes against the scratch server.
- **Definition of Done - manual:** (user confirms)
  - The scratch server looks right at 1366px and on a phone (Physical Assets, Available, detail, Lists, Quick add, issue sheet).
- **Open risks:**
  - Three more columns on Physical Assets and Available: they must still fit at 1366 beside the rail; Model/Entra hide below a breakpoint if not.
  - An admin can reactivate "Unknown" on the Lists page, which would make it pickable again (allowed deliberately: it is an ordinary archived brand).
  - Rebuilding `assets` in the migration sets `assignments` and `conditions` aside and back (the `0005` pattern); a backfill test on a pre-migration database guards it.

## Leading words

| User's explanation | Leading word |
|---|---|
| "a managed list on the Lists page, like Types" | reference list (lookup table) |
| "a brand in use can't be deleted… archive" | restrict delete + soft delete (archive) |
| "creates Unknown and assigns it to every existing asset" | backfill |
| "unique across physical assets… when given" | partial unique index |
| "valid GUID" | UUID canonical form (8-4-4-4-12 hex), stored lowercase |
| "every file that references a physical asset must be checked" | blast-radius audit |
| "browser check on the scratch server" | smoke test |

## Phase 1 - Data layer and server

- [x] 1.1 `server/db/schema.ts`: `asset_brands` table; `assets.brand_id` (not null, FK restrict), `assets.model`, `assets.entra_object_id` (partial unique index). Migration `0023` (drizzle-kit snapshot + journal) rebuilds `assets` with the `0005` set-aside pattern and backfills an archived "Unknown".
- [x] 1.2 `shared/schemas.ts`, `shared/types.ts`, `shared/constants.ts` (audit entity): brand list schemas, asset create/update/bulk fields with the Entra UUID rule, `AssetRow`/`AssignmentRow`/dashboard/holdings fields, `Lookups.assetBrands`.
- [x] 1.3 `server/services/lists.ts`, `server/routes/lists.ts`, `server/services/refs.ts`, `server/bootstrap.ts`: brands CRUD (restrict delete, last active, audit), lookups, default brands on first run.
- [x] 1.4 `server/services/assets.ts` (read, create, update, bulk, `requireBrand`, `assertEntraFree`, audit), `assignments.ts`, `reports.ts`, `employees.ts`, `programs.ts`: rows carry the fields.
- [x] 1.5 `server/seed.ts`: realistic brands, models and Entra ObjectIds, some empty.
- [x] 1.6 Tests: existing tests send `brandId`; new `server/tests/asset-fields.test.ts`.

## Phase 2 - Web (fan-out, disjoint files)

- [x] 2.1 Agent A - Lists and compact views: `web/src/routes/_app/lists.tsx`, `assignments.tsx`, `index.tsx`, `programs.tsx`, `web/src/features/employees/employee-parts.tsx`.
- [x] 2.2 Agent B - Tables, detail and exports: `assets.index.tsx`, `available.tsx`, `assets.$tag.tsx`, `web/src/lib/exports.ts`, new `web/src/lib/exports.test.ts`, `web/src/features/common/status.tsx`.
- [x] 2.3 Agent C - Forms: `web/src/features/assets/quick-add.tsx`, `asset-actions.tsx`, `web/src/features/assignments/issue-sheet.tsx`, `return-sheet.tsx`, `web/src/features/common/printout.tsx`.
- [x] 2.4 Fan-in: review the diffs, `docs/verify/quick-check.sh` passes.

## Phase 3 - Docs, smoke test and blast-radius audit

- [ ] 3.1 Agent D - Docs: `README.md`, `RUNBOOK.md`, `PRODUCT.md`, `DEPLOY-GUIDE.md` and `docs/` where they describe physical assets, Lists or exports.
- [ ] 3.2 Agent E - `docs/verify/asset-fields-smoke.mjs`.
- [ ] 3.3 Blast-radius audit: every file referencing physical assets checked (list below), fixes made.

## Phase 4 - Verify

- [ ] 4.1 `docs/verify/verify-done.sh` exits 0, output shown in chat
- [ ] 4.2 User confirms manual DoD items
- [ ] 4.3 CLAUDE.md reviewed: added / pruned / unchanged, no branch-specific text

## Blast-radius audit (3.3)

Files that reference physical assets (from `git grep` and CodeGraph); each is ticked once checked against the new fields.
