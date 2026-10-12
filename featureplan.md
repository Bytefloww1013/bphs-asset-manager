# Feature plan: Programs, Digital Assets, Import/Export

Status: **approved 2026-10-12. Built one phase at a time, stopping after each for the go-ahead.** Progress is ticked off in section 2.
Written 2026-10-12 against `main` at `6e4d346`.

## 1. Decisions already made

| # | Question | Decision |
|---|---|---|
| D1 | How a physical asset links to a program | **Program is a holder.** Assigning to a program works like issuing to an employee: dated, kept in history, shown in Active Assignments, asset leaves Available. To move it to a person it is returned first. |
| D2 | Digital asset status | **Active** (assigned) and **Not Issued** (unassigned) are derived. **Inactive** is set by hand, only while unassigned, and blocks issuing until reactivated. |
| D3 | What can be imported | **Employees and Programs only.** Physical and Digital Assets are not importable in this build. No import creates an assignment. |
| D4 | Digital Asset ID | **Always generated**: `DA-00001`, counting up. Not typed, not editable, never reused. |
| D5 | Exports and assignments | Restriction is imports only. Exports keep showing who holds what. |

Decisions I am proposing and will follow unless you change them are in section 8.

## 2. Build order

Five phases, each one committed and verified on its own, so you can stop or redirect after any of them.

- [x] Phase 1: Rename "Assets" to "Physical Assets" (labels only)
- [x] Phase 2: Programs
- [x] Phase 3: Digital Assets and Digital Asset Types
- [x] Phase 4: Import/Export page
- [ ] Phase 5: Docs and end-to-end check

Programs comes before Import/Export because the import page needs that record type to exist, and Digital Assets comes before it because the export side covers them.

## 3. Phase 1: rename to Physical Assets

Label-only. URLs (`/assets`, `/assets/BPHS-0141`), API paths, table names and audit `entity_type` values do not change, so bookmarks, the audit history and the backup script are unaffected. The product name stays "BPHS Asset Management".

- `web/src/components/shell/app-shell.tsx`: nav label "Physical Assets". Records becomes: Physical Assets, Digital Assets, Employees, Programs.
- `web/src/routes/_app/assets.index.tsx`: page title, grid label, empty states, search label, export filename `physical-assets.csv`.
- `web/src/routes/_app/assets.$tag.tsx`, `available.tsx`, `index.tsx` (Overview), `assignments.tsx`, `features/assets/*`, `features/assignments/*`: headings and sentences that say "asset" where the physical/digital distinction matters. "Asset tag", "Issue", "Return" and similar terms stay as they are.
- `PRODUCT.md` terminology line, `README.md` screen table, `RUNBOOK.md` line 134.
- Overview, Active Assignments and Available stay physical-only; their headings say so where it would otherwise be ambiguous.

About 48 user-facing strings mention assets; each is reviewed by hand rather than search-and-replaced, since many ("Asset tag", "asset type") should not change.

## 4. Phase 2: Programs

### Data

Migration `0005_programs`:

- New table `programs`: `id`, `code` (the Program ID, unique ignoring case), `name`, `address` (optional), `is_active`, `created_at`.
- `assignments` gains `program_id` and `employee_id` becomes optional, with a database CHECK that **exactly one** of the two is set. The existing unique index (one open assignment per asset) then enforces "one program OR one employee, not both" in the database, not just the app.

**Risk to know about:** SQLite cannot relax `NOT NULL` in place, so this migration rebuilds the `assignments` table (copy, drop, rename) while `conditions` points at it. The database holds only seeded data today (confirmed 2026-10-12), so nothing real is at stake and no backup is needed for this upgrade. The migration is still written to carry existing rows across correctly, and a test checks that, so it stays safe to run on any database that has live data by the time it is deployed.

### Server

- `server/services/programs.ts` (new): list, create, update, deactivate/reactivate, delete. Same rules as employees: delete is Super Admin only and only when the program has never held an asset; otherwise deactivate. A program holding assets cannot be deactivated.
- `server/routes/programs.ts` (new), mounted at `/api/programs` in `server/app.ts`.
- `server/services/assignments.ts`: `issueInTx` accepts an employee **or** a program; `OPEN_SQL`, `returnInTx` and the "already assigned to ..." conflict message handle both. Condition snapshot is still taken at issue and return, as for employees.
- `server/services/assets.ts`: `loadAssetRows` and the detail history return the program when the holder is one. `createInTx` accepts a program as the initial holder.
- `server/services/reports.ts`: dashboard "top holders" stays employees only; totals count program-held assets as assigned.
- `shared/schemas.ts`: `programCreateSchema`, `programUpdateSchema`; `issueSchema` and `assetCreateSchema` take `employeeId` or `programId`, exactly one.
- `shared/types.ts`: `ProgramRef`, `ProgramRow`; `AssetRow`, `AssignmentRow`, `HistoryRow` gain `program: ProgramRef | null` beside the existing employee field; `Lookups` gains active programs.
- Audit: entity type `program`; issue/return details read `BPHS-0141 → program P-100 · Good`.

### Web

- `web/src/routes/_app/programs.tsx` (new): grid with **Program Name, Program ID, Program Address** (plus a status badge and assets-held count in the row actions area, not as extra columns), add row, edit sheet, deactivate/delete actions. Modelled on the Employees page.
- `features/assignments/issue-sheet.tsx` and `features/assets/quick-add.tsx`: an "Issue to" choice of Employee or Program, then the matching picker.
- Asset edit: `features/assets/asset-actions.tsx` gets "Assign to program" (opens the issue sheet with Program preselected) for an in-storage asset. For an asset someone holds, the action is disabled with the reason "Return it first".
- `assets.$tag.tsx`: the holder panel and history table show the program (name and Program ID) when a program holds the asset.
- `assets.index.tsx`: **columns unchanged.** The existing "Assigned to" cell shows the program name, marked as a program; the department cell is blank for it.
- `assignments.tsx`: program-held assets appear with the program in the holder column. Export gains a "Holder type" column.

## 5. Phase 3: Digital Assets

### Data

Migration `0006_digital_assets`, all new tables, nothing existing touched:

- `digital_asset_types`: `id`, `name` (unique), `is_active`. The migration inserts **M365-BusinessStandard, M365-PowerBI, Zoho, Relias**. They go in the migration, not the dev seed, because production runs on live data.
- `digital_assets`: `id`, `code` (`DA-00001`, unique), `type_id`, `account` (License/Account, up to 200 characters), `status` (`in_service` or `inactive`), `created_at`. The code comes from the row's own auto-increment id, so it is gap-safe under concurrent adds and never reused after a delete.
- `digital_assignments`: `digital_asset_id`, `employee_id`, `issued_at`, `returned_at`, `issued_by_id`, `returned_by_id`, with the same partial unique index as physical (one open assignment per seat). No condition snapshots.

One row is one assignable seat. Ten seats of the same license are ten rows.

### Server

- `server/services/digital-assets.ts` (new): list (with derived status, assignee, issue date), detail with assignment history, create, update (type and account), set inactive / reactivate, delete (Super Admin, no history only), issue, unassign.
- Status as shown: `Active` if an open assignment exists, else `Inactive` if flagged, else `Not Issued`. Marking inactive while assigned is refused with "Unassign it first"; issuing an inactive seat is refused.
- `server/services/lists.ts` and `server/routes/lists.ts`: digital asset types with the same create/rename/deactivate/delete rules as asset types, including "the last active type cannot be removed".
- `server/services/employees.ts`: an employee holding a digital seat cannot be archived or deleted, with the reason given, as for physical assets.
- Audit: entity types `digitalasset`, `digitalassettype`; issue and unassign use the existing `issue` and `return` actions.
- No secrets: the account field's schema rejects values that label themselves as a credential (`password`, `pwd`, `secret`, `token`, `key` followed by `:` or `=`), and the form says "Email address or license reference. Never a password or key." **This cannot detect an unlabelled password.** It is a guard rail, not a guarantee.

### Web

- `web/src/routes/_app/digital-assets.tsx` (new): grid with **Asset ID, Type, License/Account, Assigned Employee, Status, Issue Date**; status filter tabs (All, Active, Not Issued, Inactive); search; add row (Type, License/Account, optional employee); Export button.
- Row actions: Issue to employee, Unassign, Mark inactive / Reactivate, Edit, Delete.
- A detail sheet (not a separate page) with the seat's assignment history: employee, issued, unassigned, by whom.
- `web/src/routes/_app/lists.tsx`: a third list, **Digital Asset Types**, using the same component as Asset Types.
- `features/employees/employee-parts.tsx`: an employee's digital seats are listed next to their physical assets, so offboarding shows everything to reclaim.

## 6. Phase 4: Administration → Import/Export

### How it is made extensible

One definition per record type in `shared/importers.ts`, used by both sides: the browser builds the mapping screen and the template from it, the server validates and creates from it. Adding a Records page later means adding one definition and one creator function; the page, mapping, preview and result need no changes.

Each definition holds: label, permission, fields (key, label, required, accepted header aliases, example), the duplicate key, and the row validator.

| Record type | Fields | Duplicate key |
|---|---|---|
| Employees | Employee ID*, First name*, Last name*, Department, Job title | Employee ID |
| Programs | Program ID*, Program name*, Program address | Program ID |

\* required. These are the only two importable types (D3). Physical and Digital Assets are deliberately left out: both would need list lookups (type, condition) and their own duplicate rules, and can be added later as one definition each without touching the page.

### Flow

1. **Choose** a record type (Employees or Programs) and a `.csv` or `.xlsx` file (first sheet, first row is the header, up to 2,000 rows).
2. **Map** each record field to a file column. Columns are matched automatically by header name and alias; the user corrects any that are wrong. Required fields must be mapped to continue.
3. **Preview**: every row marked New, Duplicate (will be skipped) or Error (with the reason and row number), with counts at the top and a filter to show only problems. Nothing is saved yet.
4. **Import**: New rows are created. The result reads "**N imported, N duplicates skipped, N failed**", lists the failed rows, and offers them as a CSV to fix and re-run. Re-running the same file is safe: everything already in is a duplicate.

Duplicates inside the same file count as duplicates (first one wins). The server re-validates at import time inside one transaction, so a row that became a duplicate between preview and import is skipped, not double-entered. One Audit Log entry per record created, action `import`, as employee import does now.

### Files

- `server/services/imports.ts`, `server/routes/imports.ts` (new): `POST /api/import/:type/preview` and `POST /api/import/:type`, taking mapped rows as JSON. Both need `record.write`.
- The file is parsed **in the browser** and only plain rows are sent. The server never opens an uploaded workbook, which keeps that class of file-parsing risk off the server. `parseCsv` moves from `server/lib/csv.ts` to `shared/csv.ts` for this.
- Excel: one new dependency, loaded only when the Import/Export page needs it so other pages do not grow. Candidate is **ExcelJS** (reads and writes, MIT, on npm). I will check its current maintenance and advisories before installing, and fall back to `read-excel-file` + `write-excel-file` if that looks better. The npm `xlsx` package is ruled out: the published version is stale with known vulnerabilities.
- `web/src/routes/_app/import-export.tsx` (new), nav entry under Administration.
- The employee import moves here: `employeeRoutes` `/import` and `/import/preview`, `previewImport`/`runImport` and `web/src/routes/_app/employees.import.tsx` are replaced by the generic pipeline, their tests ported. `/employees/import` redirects to the new page with Employees preselected, and the Employees page button points there.

### Export

- `web/src/lib/exports.ts` (new): one definition per dataset (filename, headers, how to build rows). The existing buttons on Physical Assets and Active Assignments call these instead of their inline code, so a page button and the central page always produce the same file.
- Datasets on the central page, each as **CSV** or **Excel**: Physical Assets, Digital Assets, Employees (no export exists today), Programs, Active Assignments. Audit Log links to its existing filtered CSV export on the Audit page (CSV only: it can be 50,000 rows).
- Access: every one of these is already readable by both roles, so both can export them. Users is not offered. If a dataset is ever restricted, its definition carries the permission and the page hides it.
- Excel cells are written as text, never formulas, matching the formula-injection protection the CSV export already has.
- New Digital Assets and Programs pages get their own Export button from the same definitions.

## 7. Phase 5: tests, docs, checks

- `server/tests/api.test.ts`: programs CRUD and uniqueness; issue to program, return, and the both/neither refusals; the CHECK constraint directly; digital asset ID sequence, derived status, inactive rules, issue/unassign history, archive block; list rules for digital types; import preview/commit for Employees and Programs including in-file duplicates and re-run safety, and that any other record type is refused; `record.write` required.
- Migration test: `0005` applied to a database with open and closed assignments and conditions, history intact afterwards.
- `shared/` unit tests for header auto-mapping and the secret-label guard.
- `bun run typecheck` and `bun run test` green at the end of every phase.
- Browser check of each new screen and the changed issue flow on a production build, including an `.xlsx` and a `.csv` import end to end and opening both export formats.
- `README.md` (screens, routes), `PRODUCT.md` (terminology, rules, screen list), `RUNBOOK.md` (import size note now covers the new page).

## 8. Proposed defaults: tell me if any is wrong

1. **Quick-add paste on Physical Assets is left exactly as it is**, Holder column included. It is the only bulk way to add physical assets now that they are not importable. Digital Assets have no bulk entry: seats are added one at a time on their page.
2. **Digital issue date** is today by default, with an optional earlier date on the Issue form (never a future date). Since digital assets are not imported, this is the only way existing seats get their true issue dates. The Audit Log still records when it was actually entered. Say so if you would rather it always be today.
3. **Import is open to both roles** (`record.write`), as employee import is now. Restricting it to Super Admin is a one-line change.
4. **Digital assets are issued to employees only**, not to programs.
5. **Overview, Active Assignments and Available stay physical-only.** Digital seats are tracked on their own page.
6. **Programs are deactivated, not deleted,** once they have held an asset.
7. **Employees table columns are unchanged**; digital seats show in the employee's detail and block archiving.

## 9. Not included

- Importing Physical Assets or Digital Assets (exports of both are included).
- Updating or overwriting existing records by import.
- Importing assignments, history or condition snapshots.
- Storing passwords, keys or any credential.
- License cost, renewal or expiry dates on digital assets.
- Linking employees to programs.
- Dark theme and the other open items from before this request.
