# `digital-assets` (feature)

Digital assets: licence and account seats (a Microsoft 365 licence, a Zoom host, a named user), each issued to one employee at a time. A seat has an Asset ID, a type and a License/Account, never a password or key.

## Tables

- `digital_asset_types` (`server/schema.ts`): the lookup list. Names are unique. A type is deactivated (`is_active`) rather than deleted once a seat uses it. New databases get four from migration 0006 (`M365-BusinessStandard`, `M365-PowerBI`, `Relias`, `Zoho`).
- `digital_assets`: a unique `code` (the Asset ID, `DA-00001`), its type, the License/Account (up to 200 characters) and `status` (`in_service` or `inactive`). Whether it is issued is not stored here: it comes from the open `assignments` row.
- Custody is the `assignments` foundation module's ledger (`kind = 'digital-asset'`). This module registers the kind and does the issuing and unassigning.

## Resources and rules

- It has no resource of its own: it uses `assets`. Read sees the seats, their history and the types, and exports them. Edit adds, changes, issues, unassigns, deactivates and reactivates seats, and edits the types. Full also deletes seats and types.
- The Asset ID is the row's id, given by the server. It is never typed, never edited and never reused, even after a delete.
- A License/Account that labels itself as a credential (`password:`, `key=` and the like, `looksLikeSecret` in `shared/secrets.ts`) is refused, on the form and by the server.
- A seat is issued only to an employee, never a program, and to one at a time. A second issue is refused, and the refusal names who holds it. An inactive seat can't be issued, and an issued seat can't be made inactive.
- An issue can be dated back, but not into the future and not before the seat was last unassigned. An unassign names the assignment it ends, so a stale tab is told who holds the seat now and nothing is unassigned.
- A seat that was ever issued can't be deleted, and is made inactive instead. A type in use can't be deleted, and at least one type stays active (`assertNotLastActive`, kernel).

## Hooks

- Provides `custody.kinds` (`digitalAssetCustody`): employees only, the Unassign wording and the employee's `digitalHeld` figure.
- Provides `lists`: the digital asset types (`/api/digital-asset-types`), on the Lookup lists page after the asset brands.
- Provides `lookups` (`digitalLookups`): the active types, as `digitalAssetTypes` at the end of `/api/lookups`.
- Provides the slot `employee.holdings` (the seats in an employee's holdings sheet, after the physical assets).
- Provides the export `digital-assets`.
- Uses `assignments` (the ledger), `employees` (holders), `notifications`, `audit` and `assets` (the resource and the `Lookups` type), through their public APIs.

## Notifications

- `digital_issued` goes to the account linked to the employee a seat is issued to, on creation or later. It is an employee kind, so it is forgotten when the account's employee link changes. It links to `/digital-assets`: a seat has no page of its own.

## Public API

- `shared/index.ts`: the statuses, the schemas, `looksLikeSecret`, and the row, detail and lookup types.
- `server/index.ts`: the two tables.
- `web/index.ts`: `digitalAssetsQuery`.

## Pages

- `/digital-assets` (the register, with tabs by state), in `web/routes/route.tsx`. The detail, issue, edit and unassign sheets are in `web/digital-parts.tsx`.
- The API is `/api/digital-assets` and `/api/digital-asset-types`.

## Gotchas

- The module's `seed` (`server/seed.ts`, loaded only by `bun run db:seed`) runs in its own transaction, right after the assets', on the kernel's one random sequence, so the demo data stays the same.
- The forms read `/api/lookups` through `digitalLookupsQuery`, which shares the assets module's query key, so the two never fetch twice.
