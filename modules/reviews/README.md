# `reviews` (feature)

Administrative Reviews: each review of one employee, by a reviewer, with its Corrective Action Plans (CAPs), an append-only history, and files. Confidential: it never notifies, shows no counts and writes nothing to the Audit Log; it keeps a Review Audit Log of its own. A review is never shown to the account linked to the employee it is about, at any level, Super Admin included (R9).

## Tables

- `reviews` (`server/schema.ts`): the code (`AR-<year>-<seq>`), title, summary, findings, sanitised body (HTML and plain text), review date, the employee reviewed, the reviewer, status, version, who recorded it and the last activity time.
- `review_caps`: each review's CAPs as they are now (CAP01, CAP02 per review), with the employee responsible, the due date and status. Every change to one is also written to `review_entries`.
- `review_entries`: the history: updates, corrections and what the app recorded, numbered E01, E02 per review. Triggers in the migration keep it append-only and keep an entry's CAP and corrected entry on the same review.
- `review_attachments` and `review_attachment_data`: the files on a review or one of its CAPs, and their bytes. Only `server/files.ts` reads the bytes. A withdrawal keeps the row, with its reason, and the file can no longer be downloaded.
- `review_audit_log`: the Review Audit Log, the Grievance Audit Log's shape plus the review an entry is about, so it can be hidden from the employee reviewed. Only `server/write-audit.ts` writes it.

## Resources and rules

- The `reviews` resource (`order: 40`, a workspace) has the levels None, Read, Edit and Full. It is offered only to an account linked to an employee, or the first account (`available`, R9).
- Read sees every review, its CAPs, history and files, and the Review Audit Log, prints the report and downloads files. Edit also creates reviews and adds or changes CAPs, updates, files and status on any review. Full also voids a review and withdraws a file.
- The account linked to a review's reviewer may do what Edit allows on that review, if it can at least read the workspace (`canManageReview`, through `serviceDecides`). A voided review can no longer be changed.
- Every query that reads a review, or anything on one, goes through `reviewsVisibleTo` (`server/service.ts`), which hides the reviews of the viewer's own employee.
- An edit carries the version its editor loaded, so a save made over someone else's is refused.

## Hooks

- Answers `employee.references`: an employee named on a review (reviewed, reviewer, responsible for a CAP, or through the account that documented an entry) can't be deleted, and one who reviews an open review or is responsible for an open CAP can't be archived. A viewer who can use the workspace also sees those two counts on each employee; work on a review hidden from the viewer blocks without saying what it is.
- Uses `employees` and `audit` (its query filters and log helpers) through their public APIs, plus the kernel's uploads and rich text. It never imports `notifications`, and `manifest.test.ts` checks it declares no notification kinds or Audit Log entity types.

## Notifications

- None: confidential.

## Public API

- `shared/index.ts`: the statuses and their labels, `reviewCode`, `reviewCapCode`, `canManageReview`, and the row and detail types.
- `server/index.ts`: the six tables.
- `web/index.ts`: `reviewsQuery` and `reviewQuery`.

## Pages

- The Reviews workspace (rail `order: 40`): Reviews (`/reviews`), Action items (`/reviews/actions`), Employees (`/reviews/employees`, needs Employees), and under Administration, Audit log.
- A review (`/reviews/$code`), its edit page, a new entry, a CAP (`/reviews/$code/caps/$cap`), its edit page, New CAP, and New review (`/reviews/new`). The files are in `web/routes/` under the module's `routePrefix` `/reviews`.
- The case file (`/reviews/$code/case-file`) is in `web/print/`, mounted at the root, outside the app's frame.
- The API is `/api/reviews`.

## Gotchas

- The history, the people, the files and the printout are the kernel's Records parts (`web/src/components/records/*`), shared with Grievances; the kernel names them `Record*` and `RECORD_*`, never after this module.
- The module comes after `grievances` and `maintenance` in `FEATURES`, so its `employee.references` blockers are given after theirs, as before the split.
- The "is reviewing N reviews" wording (`openReviewWork`) lives in the employees module (`foundation/employees/shared/figures.ts`), which shows it on the employee list, so the foundation never imports this module.
- The module's `seed` (`server/seed.ts`, loaded only by `bun run db:seed`) runs right after the grievances', on the kernel's one random sequence, so the demo data stays the same.
