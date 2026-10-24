# `grievances` (feature)

Grievances: each case, filed under a category, with an owner, the employees and management involved, a rich-text body, an append-only timeline, files, and every earlier version. Confidential: it never notifies, shows no counts and writes nothing to the Audit Log; it keeps a Grievance Audit Log of its own.

## Tables

- `grievances` (`server/schema.ts`): the code (`GR-<year>-<seq>`), title, short description, sanitised body (HTML and plain text), Date Made, status, owner, category, version, who recorded it and the last activity time.
- `grievance_people`: the employees and management named on each grievance (`role`). `grievance_versions`: each grievance as it stood before an edit replaced it, with the people as they were called then, who changed it and the reason.
- `grievance_entries`: the timeline: actions, events and corrections, and the system's own entries (recorded, edited, status and owner changes), numbered E01, E02 per grievance. Nothing in it is ever changed or deleted.
- `grievance_attachments` and `grievance_attachment_data`: a grievance's files and their bytes. Only `server/files.ts` reads the bytes. A withdrawal keeps the row, with its reason, and the file can no longer be downloaded.
- `grievance_categories`: the categories (six from the migration), renamed, switched off, or deleted while unused.
- `grievance_audit_log`: the Grievance Audit Log, the same shape as `audit_log` and kept apart from it. Only `server/write-audit.ts` writes it.

## Resources and rules

- The `grievances` resource (`order: 20`, a workspace) has the levels None, Read, Edit and Full.
- Read sees every grievance, its timeline, files and versions, and the Grievance Audit Log, prints the case file and downloads files. Edit also creates grievances, adds entries and files, edits any grievance, changes its status or owner, and adds or renames categories. Full also voids a grievance, withdraws a file and deletes a category.
- The account linked to a grievance's owner may edit it, change its status and give it to another owner, with Read or more (`canManageGrievance`, through `serviceDecides`). A voided grievance can no longer be changed.
- An edit carries the version its editor loaded, so a save made over someone else's is refused. Closing needs a note.

## Hooks

- Answers `employee.references`: an employee named on a grievance (as owner, involved, or through the account that documented an entry) can't be deleted, and one who owns an open grievance can't be archived. A viewer who can use the workspace also sees how many open grievances each employee owns.
- Uses `employees` and `audit` (its query filters and log helpers) through their public APIs, plus the kernel's uploads and rich text. It never imports `notifications`, and `manifest.test.ts` checks it declares no notification kinds or Audit Log entity types.

## Notifications

- None: confidential.

## Public API

- `shared/index.ts`: the statuses and their labels, `grievanceCode`, `canManageGrievance`, and the row and detail types.
- `server/index.ts`: the eight tables.
- `web/index.ts`: `grievancesQuery` and `grievanceQuery`.

## Pages

- The Grievances workspace (rail `order: 50`, last): Grievances (`/grievances`), Employees (`/grievances/employees`, needs Employees), and under Administration, Categories and Audit log.
- A grievance (`/grievances/$code`), its edit page, its versions, a new entry and one entry (`/grievances/$code/entries/$seq`), and New grievance (`/grievances/new`). The files are in `web/routes/` under the module's `routePrefix` `/grievances`.
- The case file (`/grievances/$code/case-file`) is in `web/print/`, mounted at the root, outside the app's frame.
- The API is `/api/grievances`.

## Gotchas

- The timeline, the people, the files and the printout are the kernel's Records parts (`web/src/components/records/*`), shared with Reviews; the kernel names them `Record*` and `RECORD_*`, never after this module.
- The module comes before `maintenance` and `reviews` in `FEATURES`, so its `employee.references` blocker is given before theirs, as before the split.
- The module's `seed` (`server/seed.ts`, loaded only by `bun run db:seed`) runs after the digital assets', on the kernel's one random sequence, so the demo data stays the same.
