# `assignments` (foundation)

The custody ledger: who holds which item, since when, and who held it before. Physical assets and digital assets are both issued through it, each as a kind of its own; the module whose items they are keeps its pages, its words and its audit entries.

## Tables

- `assignments` (`server/schema.ts`): one row per time an item was held, open while `returned_at` is empty. `kind` and `item_id` name the item, and the holder is an employee or a program (`employee_id` or `program_id`), never both and never neither (`ck_assignments_one_holder`). Issued and returned at and by. One open row per `(kind, item_id)` (`uq_assignments_one_open_per_item`).
- Migration 0024 made it from the old `assignments` (physical) and `digital_assignments`. Physical rows kept their ids, which `conditions`, the audit log and notifications point at; digital rows were numbered after the highest id the physical ledger had handed out. Nothing stored named a digital assignment's id.
- History is never deleted: a holder with any row can't be deleted, and the triggers below keep an item with any row.

## Resources and rules

- No resource of its own. Who may issue or return is the item module's rule (Assets Edit for both kinds today).
- `requireHolder()`: the holder is there and active (`employee_archived`, `program_inactive`), and one the kind allows (a program can't hold a digital asset: 422 on `programId`).
- `issue()`: the kind's own blocker first (`issueBlocked`: retired, inactive, 404 when there is no such item), then one open row per item (409 `asset_already_assigned`, with the open `assignmentId`). A race the check misses meets the unique index, which `describeError()` turns into the same 409.
- `returnItem()`: only an open row of that kind (404 otherwise); a second return is 409 `already_returned`, saying who closed it and whether it was you.
- Both run inside the caller's transaction. The caller checks its own rules first, in its own words and order, and writes its conditions, audit entries and notifications in the same transaction, so a later failure rolls the issue or return back.

## Kinds

- A module whose items are issued registers a `CustodyKind` (`server/kinds.ts`) through the `custody.kinds` hook: the `kind` its rows carry (never changed once there are rows: migrations name it), its label, the holders it allows, the workspace whose readers see the counts, the figure on the employee's row, the "holds N" phrase, the word that gives one back (Return, Unassign) and `issueBlocked()`.
- `assets` registers `asset` (employee or program) and `digital-assets` registers `digital-asset` (employee only). `assets` comes first in `FEATURES`, and that order decides which blocker an employee's row shows first.
- Each kind's item table carries a trigger (migration 0024): `assets_keep_held` and `digital_assets_keep_held` refuse deleting an item with history. On `assignments`, `assignments_item_exists` refuses a row naming an item that isn't there, and `assignments_item_fixed` a row changing its item. They stand in for the foreign keys `item_id` can't have.

## Jobs

- None. The overdue-asset reminders are the physical kind's (`sendOverdueReminders`, in `modules/assets`).

## Hooks

- Provides `employee.references` and `program.references` (`server/references.ts`): what each holder has now and has ever had, by kind. A holder still holding something can't be archived or deactivated (`holds_assets`, the first kind in registry order); one with any history can't be deleted (`has_history`). Someone who can't see a kind's workspace sees none of its figures, but the blockers still stand.
- Reads `custody.kinds`.

## Public API

- `server/index.ts`: the `assignments` table; `requireHolder`, `issue`, `returnItem`; `openFor(kind, itemIds?)`, `historyOf(kind, itemId)`, `heldBy(holder, ids?)`; `custodyKind`, `custodyKinds`; the types `CustodyHolder`, `CustodyRecord`, `HeldCounts`, `CustodyKind` and `Holder`.
- No shared or web side yet: the Assignments page and the issue and return sheets are the item modules'.

## Pages

- None of its own. `/assignments` (open physical assignments) is the assets module's.

## Gotchas

- A migration that rebuilds `assets` or `digital_assets` (create a copy, drop, rename) drops its `*_keep_held` trigger: recreate it in the same migration.
- A new kind adds its own three pieces in its migration: its `*_keep_held` trigger, and its `kind` in `assignments_item_exists`, which has to be recreated with every kind in it.
- `issued_at`, the order of history, can be backdated by the issue sheet, so `historyOf()` orders by it and then by id; ids are not issue order.
- Reads that join a kind's own tables (the asset and digital-asset lists, the Overview's counts, the overdue reminders) query `assignments` directly with `kind = '…'`: keep that filter, or the other kind's rows with the same `item_id` join in.
- `drizzle-kit generate --custom` copies the previous snapshot, so 0024's snapshot was written with `generateSQLiteDrizzleJson` from `drizzle-kit/api`; `docs/verify/schema-drift.sh` proves it matches the schema.
- `docs/verify/migration-check.mjs` rehearses 0024 on a production-shaped fixture, or with `--db` on a copy of a backup (RUNBOOK.md 7).
