# `assets` (feature)

Physical assets: laptops, phones and the rest, each with a tag, a type, a brand and a condition. Assets are issued to an employee or a program and returned, and a condition snapshot is taken each time. The Overview (`/`) sums it all up.

## Tables

- `asset_types`, `asset_brands` and `condition_ratings` (`server/schema.ts`): the lookup lists. Names are unique. A value is archived (`is_active`) rather than deleted once anything uses it. "Unknown" is the archived brand that migration 0023 gave every asset that existed before brands.
- A rating's `score` (1 to 100, unique) is what the rating means. The scale's order, the badge colour (`ratingBand`), the default choice (`defaultRating`) and the Overview's condition watch (below `RATING_ATTENTION_BELOW`) all come from it, never from the name.
- `assets`: a unique `tag`, its type, brand, model, serial, Entra ObjectId (unique when set, stored lowercase) and `status` (`in_service` or `retired`). Whether it is assigned is not stored here: it comes from the open `assignments` row.
- `conditions`: a rating and notes snapshot, taken at `intake`, `issue` and `return`, with who assessed it and who recorded it. The issue and return snapshots point at their row in the `assignments` ledger.
- Custody is the `assignments` foundation module's ledger (`kind = 'asset'`). This module registers the kind and does the issuing and returning.

## Resources and rules

- `assets` (a workspace, first on the rail). Read sees assets, assignments, the lists and the Overview, and exports them. Edit adds and changes assets, issues and returns them, and edits the lists. Full also deletes assets and list values.
- An asset has at most one holder at a time: an employee or a program, never both. A second issue is refused, and the refusal names who holds the asset. A return names the assignment it closes, so a stale sheet is told who returned it first.
- A retired asset can't be issued. An assigned asset can't be retired, so it is returned first.
- An asset with any history can't be deleted, and is retired instead. An asset with no history can be deleted.
- Bulk add (pasting from a spreadsheet) takes up to 500 rows. Each row is checked like Add asset and added on its own, and the bad rows are reported by row number.
- A type, brand or rating in use can't be deleted. At least one type, one brand and one rating stay active (`assertNotLastActive`, kernel). New databases get the default lists once (`ensureDefaultLists`, the startup hook), never again once there are users.

## Hooks

- Provides `custody.kinds` (`assetCustody`): the Issue and Return sheets, the holder kinds and the held count.
- Provides `employee.references` (`conditionEmployeeReferences`): an employee who assessed any condition can't be deleted.
- Provides `lists`: asset types, brands and condition ratings (`/api/asset-types`, `/api/asset-brands`, `/api/condition-ratings`). The ratings are the side column on the Lookup lists page.
- Provides the slots `employee.actions` (the Issue to button, in the Assets workspace), `employee.holdings` (the physical assets in an employee's holdings sheet) and `program.actions` (the Assign to button).
- Provides the exports `physical-assets` and `active-assignments`.
- Uses `assignments` (the ledger), `employees` and `programs` (holders and refs), `notifications` and `audit`, through their public APIs.

## Jobs

- `notifications.overdue-reminders`: every six hours, and once at start. It tells each employee holding an asset for more than `OVERDUE_DAYS` (365), once per assignment. Programs are not reminded.

## Notifications

- `asset_issued` goes to the account linked to the employee an asset is issued to. Issuing to a program tells nobody.
- `asset_overdue` goes to the same account (see Jobs). Both are employee kinds, so they are forgotten when the account's employee link changes.
- `asset_returned_poor` goes to the Assets team when a return is rated below `RATING_ATTENTION_BELOW`. A bulk return sends one notification for all of them, which lists the first ten tags.

## Public API

- `shared/index.ts`: the constants (statuses, condition kinds, rating bands, `OVERDUE_DAYS`), the schemas and the row types.
- `server/index.ts`: the tables, the default lists and `ensureDefaultLists`.
- `web/index.ts`: `IssueSheet`, `ReturnSheet` and `lookupsQuery`.

## Pages

- `/` (Overview), `/assignments`, `/available`, `/assets` (Physical Assets) and `/assets/$tag`, all in `web/routes/`.
- The Assets workspace's panel also lists the shared pages (`web/module.ts`): Employees and Programs after Digital Assets (`order: 10`), and under Administration Lists, Import/Export, Audit log and Users (Super Admin only).
- The API is `/api/assets`, `/api/assignments`, `/api/lookups` (the forms' pickers) and `/api/dashboard` (the Overview).

## Gotchas

- `/api/lookups` and `/api/dashboard` are mounted at base `''`. So is the Audit Log's router (`foundation/audit`), but no path is shared.
- The kernel never imports the module: the app layout draws the Issue and Return sheets from the `app.overlays` slot, fetches their pickers' lookups through `preload` (`web/module.ts`), and `bun run db:seed` runs `seed` (`server/module.ts`), which makes the programs after the fleet.
- `/api/lookups` ends with what other modules add through the `lookups` hook (the digital asset types), so `Lookups` has only this module's pickers.
