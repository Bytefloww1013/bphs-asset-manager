# Implementation plan: Administrative Reviews

Status: **Phase 7 built** (slices 1.1 to 7.2). Written 2026-10-16 against `main` at `066a3a4`. Updated the same day with your answers to Q2, Q5, Q6, Q8 and Q14, and with your new rule that every account is linked to an employee. Updated again with your answers to Q15 to Q19.

Every question is now answered (section 14), so the build can start with Phase 1.

The build goes one slice at a time, as Grievances did:

- Every slice ends with `bun run typecheck` and `bun run test` passing, and gets its own commit, so work can stop or change direction after any slice.
- A slice that changes a screen is also checked in headless Chromium before it is ticked.
- Phases are listed in build order. A later phase never has to undo an earlier one.

## Progress

A slice is ticked when it is finished and committed.

- [x] 1.1 "Read Only" in place of "Read"
- [x] 1.2 The "i" button beside each section's levels
- [x] 1.3 Every account linked to an employee
- [x] 2.1 Shared pieces out of Grievances
- [x] 2.2 Workspace and section
- [x] 3.1 Review data, create and detail
- [x] 3.2 History, edit and updates
- [x] 3.3 Browse
- [x] 4.1 Add a CAP, and the CAP page
- [x] 4.2 Change, reassign and complete a CAP
- [x] 4.3 Action items across every review
- [x] 5.1 Files: storage and upload
- [x] 5.2 Files: download and withdraw
- [x] 6.1 Review status and voiding
- [x] 6.2 Guards on employees
- [x] 6.3 Review Audit Log page and export
- [x] 7.1 Printable review report
- [x] 7.2 Seed, docs, end-to-end check

## 1. What it does

An Administrative Review is recorded once. It names the employee reviewed and the employee who conducted the review, gives the date of the review, and holds the findings and the full write-up.

The work that has to follow is written as **Corrective Action Plans (CAPs)**, one per action item. A CAP is added the way an Action or Event is added to a grievance, with the same kind of form and the same place on the review's timeline. It also has:

- one responsible employee;
- a due date, which is optional;
- a status, and the date it was completed.

Progress on a CAP is recorded as updates over time. Files can be attached to a CAP or to an update, for example to show that the work was done, but they are never required. The review is marked **Completed** once every CAP is Completed or Cancelled.

**A review is never shown to the employee it is about,** not even with Edit or Super Admin access (Q6).

The server stamps every change with the date, the time and the account that made it, and the change appears in the review's history. Nothing is ever deleted:

- a mistaken update is fixed with a correction;
- a CAP added by mistake is cancelled, with a reason;
- a file added by mistake is withdrawn;
- a review entered by mistake is voided.

## 2. How it maps to Grievances

| Grievances | Administrative Reviews |
|---|---|
| Grievance `GR-2026-0001` | Review `AR-2026-0001` |
| Owner | **Reviewed by:** one employee. Their linked account can manage the review, as an owner's account can manage a grievance (Q5). |
| Employees Involved | **Employee reviewed:** one employee. The review is hidden from their account (Q6). |
| Title, Short description and Details (rich text) | Title, Summary, Findings and Review body (rich text) (Q2) |
| Action and Event entries on the timeline | **CAPs.** They are added with the same kind of form and shown on the timeline the same way. Each one also has a status, a responsible employee, a due date and a history of updates (Q8). |
| Correction entry | The same: a correction to an update |
| Automatic entries for status and owner changes | The same, for every change to the review and to each CAP |
| Attachments on the grievance or on an entry | The same, plus files on a CAP. They are always optional. |
| Edit, with earlier versions kept | Edit, with the earlier text kept in the history |
| Void (Full) and withdraw a file (Full) | The same |
| Categories | None |
| Grievance Audit Log | Review Audit Log, kept apart from the other two logs |
| PDF case file and Excel workbook | A printable review report, plus the Action items list exported as CSV or Excel (Q10) |

## 3. Decisions made

| # | Question | Decision |
|---|---|---|
| R1 | Separate workspace | **A fourth workspace behind the same sign-in.** It has its own sidebar, URLs (`/reviews`, `/api/reviews`), tables (prefixed `review_`), audit log and file store. Nothing from it appears in another workspace, which is how Grievances works. |
| R2 | Permissions | **A new section, Administrative Reviews,** with None, Read Only, Edit and Full like the other sections. Super Admin stays Full here as everywhere, with one exception: it does not see a review about themselves. It is still the only level that manages accounts. Existing accounts start at None, so there is nothing to migrate. |
| R3 | Responsible person | **An employee,** picked from the one Employees directory. Only active employees can be picked. |
| R4 | Time stamps | **Set by the server, never typed.** That covers when each review, CAP, update and file was recorded, when each change was made, and when each CAP was completed. An update also has an *Occurred at* time that the user enters. It defaults to now and may be earlier, but never later, as on a grievance entry. |
| R5 | History | **Append-only,** enforced by database triggers, as on grievances. |
| R6 | "Read Only" | **The Read level is renamed Read Only** everywhere a level is named (Q12). |
| R7 | The "i" button | **It opens on click or tap,** like a small popover rather than a hover tooltip, so it also works on touch screens and from the keyboard. There is one beside each section's row of levels. |
| R8 | Linked accounts | **Every account is linked to an employee, except the first account.** That is the Super Admin created on first run. This is your new rule, and the Q6 rule depends on it. |
| R9 | Hidden from the employee reviewed | **A review does not exist for the account linked to its employee reviewed.** Every list, page, file, export and audit entry about it is left out, and a direct link answers "not found" (Q6). |
| R10 | Overdue | **Not flagged.** Due dates are shown and can be sorted, but nothing marks a CAP as overdue until the notification work is done (Q14). |

## 4. Workspace and permissions

### What each level allows here

Every level below excludes any review about the account's own employee (R9).

| Level | In Administrative Reviews |
|---|---|
| None | The workspace is hidden, and the API answers 403. |
| Read Only | See every review, with its CAPs, history and files. Download files and print the report. **On a review that names this account's employee as Reviewed by,** also do everything Edit allows on that review (Q5). |
| Edit | Everything in Read Only, plus: create reviews, and do the following on any review. Edit it, add and edit CAPs, choose who is responsible, set due dates, change any CAP's status, add updates and files, and change the review's status, including to Completed. |
| Full | Everything in Edit, plus: void a review, and withdraw a file added by mistake. |
| Super Admin | Full, as in every section. |

The "i" button for this section shows a shorter version of this table (slice 2.2).

### Who sees a review (Q6)

- **The account linked to the employee reviewed never sees the review.** This applies at every level, including Super Admin.
- The server applies this in one place: `reviewsVisibleTo(user)`, a SQL condition in `server/services/reviews.ts`. Every query that reads reviews, CAPs, entries, files or review audit entries uses it.
  - A hidden review answers 404 "Review not found", never 403, so its existence is not confirmed.
  - It is also left out of every count: the list, the Action items, the audit log and the Reviews workspace's Employees page.
- **Reviews needs a linked account.** An account with no linked employee has None in Reviews, whatever its saved level, because the server could not tell which reviews to hide from it. The one exception is the first account, which is not a person who could be reviewed.
  - The rule lives in `levelOf` in `shared/permissions.ts`, so the switcher, the route guard and the pages all agree.
  - The session already carries `employeeId`. It gains `firstAccount`, which is true for the account with the lowest ID. Accounts are only ever deactivated, never deleted, so that is always the one created on first run.
- **Nobody can change the employee linked to their own account** (slice 1.3), so nobody can unlink themselves to see a review about them.

### Where the server checks access

- **`accessNeeded()` in `server/app.ts`** gets a branch for `/api/reviews`:
  - GET needs Read Only.
  - `POST /api/reviews` (create a review) needs Edit.
  - Every write under `/:code` needs only Read Only, as the grievance routes an owner may use do. The service then decides with `canManageReview`.
  - Void and withdraw also have `requireFull('reviews')`.

  Slice 2.2 gates the whole of `/api/reviews` by method alone (Read Only to read, Edit to write). The Read Only exception for writes under `/:code` comes with `canManageReview` in slice 3.2, the first slice with such a write.
- **`canManageReview(user, reviewerEmployeeId)`** in `shared/permissions.ts` makes that decision for both the server and the pages. It is a copy of `canManageGrievance`: Edit in Reviews, or the account linked to the reviewer. `reviewManageReason(name)` gives the text shown on a disabled button: "Only the reviewer (name) or someone with Edit access to Administrative Reviews can do this."

### What adding a workspace touches

- `shared/constants.ts`: `'reviews'` is added to `WORKSPACES`, labelled "Administrative Reviews". `SECTIONS` and `SECTION_LABEL` pick it up from there, so the Users sheets get a row for it with no other change.
- `shared/permissions.ts`: the linked-account rule in `levelOf` (slice 2.2), and `canManageReview` (above, slice 3.2). `Grantee` has optional `employeeId` and `firstAccount`; they are left out where only saved levels are judged, as when the Users sheet checks an account has somewhere to land.
- `server/services/auth.ts`: `firstAccountId` moved here from `users.ts`, and the session user carries `firstAccount`.
- `server/services/users.ts`: the message in `assertWorkspace` names the workspaces by hand ("Assets, Grievances or Maintenance"). It is changed to build the list from `WORKSPACE_LABEL`.
- `web/src/lib/workspace.ts`: `WORKSPACE_HOME.reviews = '/reviews'`, and `reviews` is added to the `workspaceOf` pattern.
- `web/src/components/shell/app-shell.tsx`:
  - the Reviews sidebar in `useNav`;
  - the new routes in `NavEntry.to`;
  - the switcher's "Confidential" line, shown for Reviews as well as Grievances.

  The switcher already stacks its options when there are three or more.
- `server/services/employees.ts`: `seesEverything` is built from `WORKSPACES`, so it already covers Reviews. Slice 6.2 adds the review counts.
- `server/app.ts`: the access branch described above, and `UPLOAD_PATH` widened to the review routes that take files (slice 5.1).
- Tests that list the workspaces: `server/tests/workspaces.test.ts`, `server/tests/access.test.ts` and `shared/permissions.test.ts`.

### Sidebar

- **Records:** Reviews, Action items, and Employees (shown only if the account can read Employees, as in Grievances).
- **Administration:** Audit log.

Each entry is added by the slice that builds its page, so the sidebar never links to a page that does not exist yet.

## 5. Data (migrations 0015 and 0016)

All the tables are new and prefixed `review_`. No existing table changes. Times are stored in milliseconds, like the rest of the schema. Dates the user picks (review date and due date) are stored as `YYYY-MM-DD` text, so time zones cannot shift them.

- **`review_audit_log`** (0015, with the review tables so that `review_id` can point at `reviews`): the same columns as `grievance_audit_log`, plus `review_id`. That column lets an entry about a review be hidden from its employee reviewed. Append-only, enforced by a trigger.
- **`reviews`** (0015):
  - `id`
  - `code` (unique), plus `year` and `seq` (unique together)
  - `title` (up to 150 characters) and `summary` (up to 300)
  - `findings`: plain text, several lines, up to 2,000 characters (Q15)
  - `body_html` and `body_text`, which hold the Review body
  - `review_date`
  - `employee_id`, the employee reviewed → employees
  - `reviewer_id` → employees. A check constraint makes it differ from `employee_id`.
  - `status` and `version`
  - `created_by_user_id`, `created_at`, `last_activity_at` and `completed_at`
- **`review_caps`** (0015): each CAP as it is now.
  - `id`, `review_id`, and `seq` (unique per review)
  - `title` (up to 150 characters) and `short_description` (up to 300)
  - `body_html` and `body_text`, which hold the optional Details
  - `responsible_employee_id` → employees
  - `due_date`, which is optional
  - `status`: `not_started`, `in_progress`, `completed` or `cancelled`
  - `version`, `created_by_user_id`, `created_at` and `updated_at`
  - `completed_at`, `completed_by_user_id` and `completed_by_label`. A check constraint allows `completed_at` only when `status = 'completed'`.

  Every change to a CAP is also written to `review_entries`, which keeps what the CAP said before.
- **`review_entries`** (0015): the history.
  - The same columns as `grievance_entries`, plus `cap_id`, which is null when an entry is about the review itself.
  - `kind` is `update`, `correction` or `system`.
  - Append-only, enforced by triggers. One more trigger refuses an entry whose CAP, or whose corrected entry, belongs to a different review.
- **`review_attachments`** and **`review_attachment_data`** (0016): the same columns as the grievance pair, plus `cap_id`. The bytes are kept in the database, behind `server/lib/review-files.ts`, which is how grievance files are stored (G10 in the Grievances plan).

Every reference to an employee or a user is `ON DELETE RESTRICT`, as on grievances. The migrations are made the same way as 0008 to 0011: generated first, then the triggers added by hand.

## 6. Screens

| Address | What is there |
|---|---|
| `/reviews` | The list of reviews. Tabs by status: Open, In progress, Completed, Voided and All. A search box, and filters for reviewer, employee reviewed and review date. Columns: ID, Title, Employee reviewed, Reviewed by, Review date, Status, CAPs done out of the total, Next due date and Last activity. |
| `/reviews/new` | A form for Title, Summary, Review date, Reviewed by, Employee reviewed, Findings and Review body. The rich-text editor is the one Grievances uses. |
| `/reviews/$code` | One review, laid out like a grievance. The details and Review body sit at the top, with the timeline below. On the timeline, CAPs appear the way Actions and Events do on a grievance, each with its status, responsible employee, due date and completed date. Updates and automatic entries appear there too. On wide screens a summary sits beside it: status, CAPs done out of the total, each CAP with its status, first and latest activity, and completed date. |
| `/reviews/$code/edit` | A form to edit the review's details. |
| `/reviews/$code/caps/new` | Add a CAP. The form is the grievance's Add entry form: Title, Short description, Details and Files. It adds Responsible employee and Due date, and drops Occurred at, because a CAP's time is recorded automatically. |
| `/reviews/$code/caps/$cap` | One CAP, laid out like a grievance entry's page: every field, its files, its status and dates, and its own history of updates. Buttons for Add update, Edit, Change status and Mark complete. |
| `/reviews/$code/report` | The printable report. It sits outside the app's frame, like the grievance case file. |
| `/reviews/actions` | Action items: every CAP on every review the account can see, with filters for status, responsible employee and due date, and an export. |
| `/reviews/audit` | The Review Audit Log. |
| `/reviews/employees` | The Employees page, as in Grievances. |

A CAP's address uses its number as the pages show it, for example `/reviews/AR-2026-0001/caps/CAP01`. A bare `1` is read the same way.

## 7. Phase 1: Users screen

These three slices change only accounts and the Users screen. They can be deployed on their own.

### Slice 1.1: "Read Only" in place of "Read"

- **`shared/constants.ts`:** `ACCESS_LEVEL_LABEL.read` becomes `'Read Only'`. Everything that names the level reads it from there, so all of these change at once (Q12):
  - the selectors in both sheets;
  - the Users table;
  - the account summary;
  - `describeAccess`, which `server/admin.ts` also prints.
- **`web/src/routes/_app/users.tsx`:** the hint under "Set all to" becomes: "Read Only sees a section. Edit also adds and changes records. Full also deletes, archives and voids."
- **`needsAccess` needs no change.** For the read level it already says "does not have access" rather than naming the level.
- **Tests** that expect "Read" in the output of `describeAccess` are updated.
- **Done when:**
  - the New account and Access sheets show None · Read Only · Edit · Full;
  - the Users table shows, for example, "Assets: Read Only";
  - all four options still fit on one line inside the sheet at phone width (390 px).

### Slice 1.2: The "i" button beside each section's levels

- **`web/src/components/ui/info-popover.tsx`:** a small `InfoPopover({ label, children })`. It is built on `@radix-ui/react-popover`, which is already installed and used by the combobox.
  - It is a round button showing lucide's `Info` icon.
  - It opens on a click, a tap, Enter or Space.
  - It closes on Escape, on a click outside, or on the button again. Focus then goes back to the button.
  - It is drawn on top of the sheet, so the sheet cannot hide it.
- **In `AccessFields`,** each section's row puts the button straight after its level selector, to the right of Full.
  - The button sits outside the group of level options, so the arrow keys still move only between levels.
  - Its accessible name is "What each level means in Assets" (with the section's name).
  - The "Set all to" row gets no button (Q13).
- **`web/src/features/users/level-help.ts`** holds the text as `LEVEL_HELP: Record<Section, Record<AccessLevel, string>>`. Because it is typed by section, the typecheck fails until a new section's text is written, so slice 2.2 cannot add Reviews without it. The popover lists all four levels with what each one means.
- **The texts,** checked against the routes as they are today:

  | Section | None | Read Only | Edit | Full |
  |---|---|---|---|---|
  | Assets | The Assets workspace is hidden. | See assets, digital assets, assignments, programs, lists, the Overview and the Audit Log, and export them. | Also add and change all of these, issue and return assets, and import. | Also delete assets, digital assets, programs and list values. |
  | Grievances | The Grievances workspace is hidden. | See every grievance, with its timeline, files and earlier versions, and the Grievance Audit Log. Print the case file and download files. The account linked to a grievance's owner can also edit that grievance, change its status and give it to another owner. | Also create grievances; add actions, events, corrections and files; edit any grievance and change its status or owner; and add or rename categories. | Also void a grievance, withdraw a file and delete a category. |
  | Maintenance | The Maintenance workspace is hidden. | See every request and its timeline. | Also enter requests, dispatch them, change their status and add notes. | Also delete a request. |
  | Employees | The Employees page is hidden. Employees can still be chosen in any form. | See the Employees page. | Also add and change employees. | Also archive, restore and delete them. |

- **Done when:**
  - every section's row in both sheets has the button;
  - it opens and closes with a mouse, a touch and the keyboard;
  - a screen reader reads its name and its contents;
  - the sheet does not scroll sideways at 390 px;
  - there is a Playwright screenshot of the popover open.

### Slice 1.3: Every account linked to an employee

Today the link is optional, and the only thing you can do with it after creating an account is unlink it. This slice makes it required (R8) and lets a link be set or corrected.

- **New accounts:** `userCreateSchema` requires `employeeId`. In the New account sheet, "Linked employee" is no longer marked optional. Its hint becomes: "Every account belongs to one employee. An employee can be linked to one account only."
- **`updateUser` in `server/services/users.ts`** refuses:
  - removing the link from any account except the first: "Every account must be linked to an employee.";
  - changing the link on your own account (`self_link`): "You cannot change the employee linked to your own account." This is what stops anyone unlinking themselves to see a review about them (section 4).
- **`assertEmployee`'s** "already linked" message ends "Unlink that account first." Unlinking is no longer allowed, so it becomes "Link that account to someone else first."
- **Users screen:**
  - The "Unlink employee" action becomes **"Link employee"** for an account with no link, or **"Change linked employee"** for one that has a link. Both open a small sheet with the employee picker from the New account sheet. Employees already linked to another account are not offered, and the server still refuses them. The action is disabled on your own account, with the reason shown.
- **The live system needs no clean-up.** Every account there is already linked, except the first (Q18). On any other database, an account left unlinked keeps working in Assets, Grievances and Maintenance, and has None in Reviews until it is linked (section 4, applied in slice 2.2).
- **The first account** is created by `ensureBootstrapAdmin` with no link and may stay that way. If it is also a person's account, another Super Admin can link it.
- **The sample data** in `server/seed.ts` follows the rule: Ops Account is linked to Grant Halloway (E-0761). Rosa Lindqvist had no employee record, so that sample account became Rosa Delgado (`r.delgado@bphs.local`, E-1102).
- **An employee who cannot be deleted** because of a linked account now says "Link that account to someone else on Users first." rather than "Unlink it on Users first."
- **Tests:** `server/tests/api.test.ts` and `server/tests/access.test.ts` create accounts through `/api/users` without an employee, so those calls are changed to pass one. Tests that insert accounts directly are not affected. New tests cover:
  - creating an account without an employee;
  - unlinking;
  - changing your own link;
  - that the first account may stay unlinked.
- **Done when:**
  - an account can't be created or left without an employee, apart from the first;
  - an account's link can be set or changed from the Users screen, except on your own account.

## 8. Phase 2: Groundwork

### Slice 2.1: Shared pieces out of Grievances

This slice changes no behaviour. It moves the grievance pieces that Reviews will also use to places both workspaces can import from.

- **`server/lib/uploads.ts`:** `readUploads` and `Upload`, with their content checks, moved from `server/services/grievance-attachments.ts`. The refusal message no longer mentions grievances: "run.exe is not a type that can be attached: PDF, PNG, …". The test at `server/tests/grievances.test.ts:1178` is updated to match.
- **`server/http.ts`:** `contentDisposition`, moved from `server/routes/grievances.ts`.
- **`web/src/features/common/files.tsx`:** `FilePicker`, `filesProblem`, `withFiles`, `fileSize`, `FILES_HINT` and `AttachmentList`.
  - `AttachFiles` and `AttachmentList` take their record's section and code, instead of a grievance code. The API path (`/grievances/GR-…` or `/reviews/AR-…`) is built from the two, and the section also decides who may withdraw a file. A `RECORDS` map in the same file names each section's record and numbers its entries; slice 5.1 adds Reviews to it.
  - `FILES_HINT` no longer mentions grievances either.
- **`web/src/features/common/people-picker.tsx`:** `PeoplePicker`, moved without changes.
- **`web/src/features/common/timeline.tsx`:** `Timeline` and `EntryMarker`. They now take, as props, the entry types to filter by and how to display an entry's number. Grievances passes Action and Event, as today. Reviews will pass CAP and Update. `TimelineSummary` stays with Grievances, in `web/src/features/grievances/timeline-summary.tsx`.
- **The entry form:** the fields that Add entry and Add CAP share (Title, Short description, Details and Files) move out of the Add entry page (`grievances.$code.entries.new.tsx`) to `EntryFields` in `web/src/features/common/entry-fields.tsx`, so a CAP is added the same way an Action is (Q8).
- **Done when:**
  - every grievance test passes, with the reworded refusal message;
  - the grievance detail page, entry pages, Add entry page and New grievance page look and behave exactly as before, compared in Playwright before and after the move.

### Slice 2.2: Workspace and section

- **The workspace itself:** everything listed under "What adding a workspace touches" in section 4, except `canManageReview` (slice 3.2) and the employee counts (slice 6.2). That includes:
  - the linked-account rule in `levelOf`;
  - `firstAccount` on the session.
- **`web/src/routes/_app/reviews.tsx`:** the workspace's layout route, a bare `<Outlet />` as for Grievances, so the workspace's code loads only when it is opened. Each page sets its own tab title with `useReviewPageTitle` from `web/src/features/reviews/page-title.ts` ("Administrative Reviews · BPHS-Connect", or the page's name in front). An empty Reviews page and its sidebar entry are added in this slice too.
- **`LEVEL_HELP.reviews`:** the texts from section 4, shortened to one line per level. The Read Only line names the reviewer rule, that no one is shown a review of themselves, and that an unlinked account is shown none.
- **`server/routes/reviews.ts`,** mounted at `/api/reviews`. For now it answers with an empty list.
- **Moved to slice 3.1:** the review audit log, `writeReviewAudit` and the test that keeps the logs apart, so that `review_audit_log.review_id` can have a foreign key to `reviews` in the same migration.
- **Done when:**
  - an account with Read Only in Reviews sees the workspace in the switcher and lands on an empty Reviews page;
  - an account with None does not see it, and gets 403 from the API;
  - an unlinked account with Read Only saved for Reviews is treated as None;
  - a Super Admin sees it without any change to their account;
  - a page reload stays in the workspace;
  - the Users sheets show the Administrative Reviews row with its "i" text.

## 9. Phase 3: Review records

### Slice 3.1: Review data, create and detail

- **Migration `0015_reviews`:** creates `reviews`, `review_caps`, `review_entries` and `review_audit_log` (section 5), with their append-only triggers.
  - The CAP table is created now so that the list in slice 3.3 can count CAPs from the start.
  - Only phase 4 writes to it.
- **The audit log** (moved here from slice 2.2):
  - `server/lib/review-audit.ts` holds `writeReviewAudit`, which runs inside the same transaction as the change it records.
  - `REVIEW_AUDIT_ACTIONS` are: create, update, status, void, entry, attach, withdraw, download and export.
  - `entityType` is one of review, cap, entry or attachment.
  - The details hold IDs and titles only, never the text of findings, the review body, CAP details or updates.
- **The test that keeps the logs apart** gets a match in `server/tests/reviews.test.ts`:
  - server files whose names start with `review` write only to the review log;
  - no other file writes to it.

  So every Reviews server file must keep the `review` prefix.
- **IDs:** `nextReviewCode(tx)` returns `AR-<year>-<seq>`, the same way `nextGrievanceCode` works. `reviewCode()` and `reviewCapCode()` go in `shared/constants.ts`.
- **Statuses:** `REVIEW_STATUSES` (`open`, `in_progress`, `completed`, `voided`) and `REVIEW_CAP_STATUSES` go in `shared/constants.ts` with their labels. The database checks both (Q3, Q4).
- **`reviewsVisibleTo(user)`** (section 4) is written in this slice. The first review query uses it, and so does every query added after it.
- **`POST /api/reviews`** takes:
  - Title, Summary, Review date (not in the future), Reviewed by and Employee reviewed, all required. The reviewer and the employee reviewed must be different people, and both must be active.
  - Findings, which are optional.
  - Review body, which is optional and cleaned by `cleanRichText`. Both can be written later with Edit.

  It creates the review as Open, and writes E01, "Review created", as a system entry.
  - The account creating the review cannot name its own employee as the employee reviewed. Otherwise the review would disappear from the person who just wrote it.
- **`/reviews/new`** is the form. It uses `PeoplePicker` and the rich-text editor.
- **`GET /api/reviews/:code`** and a first version of `/reviews/$code`, showing the details, the Review body and an empty timeline.
- **Done when:**
  - a review can be created, and the page then lands on it;
  - archived employees can be neither picked nor sent;
  - a request from an account without Edit gets 403;
  - the account linked to the employee reviewed gets 404 on the review, even as a Super Admin.

### Slice 3.2: History, edit and updates

- **`canManageReview` and `reviewManageReason`** (section 4) are added here, with the Read Only exception in `accessNeeded` for writes under `/:code`.
- **The history:** `GET /api/reviews/:code/entries` returns the review's entries. The review page shows them with the shared `Timeline`, filtered by All, CAPs or Updates, with a switch to hide automatic entries. On wide screens the summary sits beside it.
- **Edit:** `PATCH /api/reviews/:code` is allowed by `canManageReview`, so for Edit or the reviewer's account. It takes an `expectedVersion`. If someone else has saved in the meantime, the edit is refused with 409, as on grievances.
  - Each saved edit writes a system entry naming each changed field, as old → new.
  - When the Findings or the Review body change, that entry also carries the text as it was, so nothing written earlier is lost.
  - Changing the reviewer or the employee reviewed is recorded the same way. The rule against naming your own employee as the employee reviewed applies here too.
- **Updates:** `POST /api/reviews/:code/entries` takes Occurred at, Title, Short description and optional Details.
  - A correction is added through the same form with `?corrects=`, as on grievances.
  - Both ends of a correction show the link, as "Corrects" and "Corrected by" chips.
- **Done when:**
  - a test proves that no route can change or remove an entry;
  - an edit sent with an out-of-date version is refused;
  - the history shows each edit together with what it replaced;
  - the reviewer's Read Only account can edit, and another Read Only account cannot.

### Slice 3.3: Browse

- **`GET /api/reviews`** returns the list, with the columns from section 6. The CAP counts are zero until phase 4 adds CAPs.
- **`/reviews`** has the tabs, search and filters from section 6.
- **Done when:**
  - each status tab shows only its own reviews;
  - the search finds a review by ID, title or the name of the employee reviewed;
  - a review about the signed-in account's own employee appears in no tab, search or count.

## 10. Phase 4: Corrective Action Plans

### Slice 4.1: Add a CAP, and the CAP page

- **`POST /api/reviews/:code/caps`** is allowed by `canManageReview`.
  - It takes Title, Short description, optional Details, the Responsible employee (who must be active), an optional Due date, and optional files. Files are wired up in slice 5.1.
  - The CAP starts as Not started.
  - It writes a system entry: "CAP01 added: <title>. Responsible: <name>. Due: <date>."
  - A Completed or Voided review takes no new CAPs, and answers 409 `review_sealed`.
- **The form** uses the entry fields shared in slice 2.1, so it looks and works like Add entry on a grievance (Q8).
- **On the review's timeline,** each CAP is shown the way an Action is: its number, title and short description, plus its status, responsible employee, due date and completed date. The summary beside the timeline lists every CAP with its status.
- **`/reviews/$code/caps/$cap`** shows:
  - every field of the CAP;
  - its own history, meaning the review's entries that carry this CAP's id;
  - an Add update button, which writes a `review_entries` row carrying the CAP's id.
- **Done when:**
  - CAPs are numbered CAP01, CAP02 and so on, in order, and no number is ever reused;
  - a CAP's page shows only that CAP's history;
  - the review's timeline shows everything.

### Slice 4.2: Change, reassign and complete a CAP

Everything in this slice is allowed by `canManageReview`, so for Edit or the reviewer's account (Q5).

- **`PATCH /api/reviews/:code/caps/:cap`** takes an `expectedVersion`. It can change the title, short description, details, responsible employee and due date.
  - Each save writes a system entry with old → new values.
  - When the Details change, the entry also carries the Details as they were.
  - A Completed or Cancelled CAP must be reopened before it can be edited.
- **`POST /:code/caps/:cap/status`** takes `{ status, note?, expectedVersion }`:
  - **Completed** stamps `completed_at`, and who completed it, from the session.
  - **Reopening,** back to In progress, clears both stamps. The history keeps the earlier completion.
  - **Cancelled** needs a reason, which goes into the history.
  - Every status change writes a system entry.
  - If a note is sent, it is saved as an update on the CAP at the same moment.
- **The CAP page** disables what the account may not do, with `reviewManageReason` as the reason, as Grievances does for accounts that are not the owner.
- **Done when** tests cover:
  - each status change and its time stamps;
  - an edit sent with an out-of-date version;
  - the reviewer's Read Only account allowed to edit, reassign and complete;
  - another Read Only account refused, including the CAP's own responsible employee;
  - the employee reviewed getting 404 on every CAP route, even with Edit.

### Slice 4.3: Action items across every review

- **`GET /api/reviews/action-items`** returns every CAP on the reviews the account can see, with its review's ID and title, the responsible employee, due date, status and completed date. It is declared before `/:code`, like `/audit`, so the route is not mistaken for a review ID.
- **`/reviews/actions`** shows a table:
  - **Tabs:** Open (Not started and In progress), Completed, Cancelled and All. Open is the default, sorted by due date with the earliest first.
  - **Filters:** responsible employee and due date, plus a search box.
  - **Export:** CSV or Excel, through the existing `ExportButton` (Q10).
  - Nothing is marked overdue (Q14).
- **Done when:** the export contains exactly the rows the table shows, and leaves out CAPs on a review about the signed-in account's employee.

### Where Phase 4 differs from this plan

- **`version`, not `expectedVersion`:** the CAP edit and status requests carry the version as `version`, the name the review edit already uses.
- **A status note** is saved in the body of the status change's own system entry, not as a separate update. It shows on the history under the change, with who wrote it.
- **Sealed early:** a Completed review already refuses new CAPs, CAP changes, updates and corrections with 409 `review_sealed`. Phase 6 adds the way to complete and reopen a review.
- **Action items:**
  - CAPs on a voided review are left out, as they can no longer be acted on.
  - The page loads every CAP the account may see and filters on the page, as Requests does. The list is small enough.
  - Export is two buttons, Export CSV and Export Excel, not `ExportButton`, which only makes CSV. The page saves the rows it shows, in the order shown, and first reports the copy to `POST /api/reviews/action-items/exports`, so each one is in the Review Audit Log.

## 11. Phase 5: Files

### Slice 5.1: Storage and upload

- **Migration `0016_review_attachments`:** the two file tables from section 5.
- **`server/lib/review-files.ts`:** `put` and `get`. This is the only code that reads or writes `review_attachment_data`.
- **Uploads** go up as multipart and are checked by `readUploads` (slice 2.1), with the same types, sizes and counts as grievance files (Q9). Files are always optional (Q8). They can be added:
  - with a new CAP (`POST /:code/caps`);
  - with an update (`POST /:code/entries`), on a CAP or on the review;
  - on their own (`POST /:code/attachments`), with an optional CAP number;
  - when marking a CAP Completed (`POST /:code/caps/:cap/status`).
- **`UPLOAD_PATH` in `server/app.ts`** now includes those four paths, so they get the larger upload limit, applied after the sign-in check.
- **Each file** writes a system entry and an `attach` audit entry with the file's name.
- **Where files are listed:**
  - a CAP's page lists its files;
  - the review lists its own files, and every file with the CAP it belongs to.
- **Done when:**
  - a file of the wrong type, a renamed executable, a file over 10 MB and an eleventh file are each refused, with nothing written;
  - a file attached while completing a CAP is saved together with the completion, or neither is saved.

### Slice 5.2: Download and withdraw

- **`GET /:code/attachments/:id`** always downloads the file and never shows it in the page. It is sent with `nosniff`, so the browser cannot treat it as something else, and each download is logged as `download`. The employee reviewed gets 404.
- **`POST /:code/attachments/:id/withdraw`** (Full) takes a reason.
  - The file stays listed, marked as withdrawn, and can no longer be downloaded.
  - Its bytes stay in the database.
  - A trigger allows this one change to a file row and nothing else.
- **Done when:** a test proves that no route deletes a file or its bytes.

### Where Phase 5 differs from this plan

- **One entry per set of files, not per file:** the files sent together get one automatic entry, "File attached" or "3 files attached", with their names. It is filed on the CAP when they are on one ("CAP01: 2 files attached"). The files hang off that entry, not off the update, CAP or status change they came with, so every file has an entry and `entry_id` is required. Each file still has its own `attach` audit entry.
- **Evidence:** a status change takes files whatever the new status, but the page offers them only when marking a CAP Completed, as "Evidence".
- **A CAP's edit takes no files.** Files are added to a CAP from its page, with Attach files.
- **Withdrawing** also writes an automatic entry, "File withdrawn" with the reason, filed where the file is. Like attaching, it is refused on a Completed review with 409 `review_sealed`. The files of a Completed review still download.
- **The file list** is read through the same check as the review, so the employee reviewed gets 404 on listing, downloading, attaching and withdrawing. Each file in the list carries its CAP number and the number of its entry.
- **A panel header's buttons now wrap** on a narrow screen. The review's Timeline header gained a third button, Attach files, which pushed the page wider than a phone.

## 12. Phase 6: Lifecycle, guards and the audit log

### Slice 6.1: Review status and voiding

- **`POST /:code/status`** is allowed by `canManageReview`. It moves a review between Open, In progress and Completed.
  - **Completed** is refused with 409 while any CAP is Not started or In progress, and the message says how many. When accepted, it stamps `completed_at`.
  - **A Completed review** takes no new CAPs, updates or files until it is reopened. Reopening is a status change, and it is recorded.
- **`POST /:code/void`** (Full) takes a reason. A voided review is sealed for good.
- Every status change and every void writes a system entry.
- **Done when** tests cover: Completed refused while a CAP is still open, reopening, a sealed review refusing each kind of write, and voiding refused without Full.

### Slice 6.2: Guards on employees

All in `server/services/employees.ts`:

- **Delete:** `deleteBlocked` refuses with "Named on an administrative review. Archive instead; history is never deleted." when the employee is any of these:
  - the employee reviewed;
  - the reviewer;
  - responsible for a CAP;
  - the person who documented an entry.

  An account that cannot see every review involved gets the general `HIDDEN_BLOCK` reason instead, so the refusal does not reveal a review to the employee it is about.
- **Archive:** archiving is refused while the employee is the reviewer of a review that is Open or In progress, or responsible for a CAP that is Not started or In progress on a review that is not Voided. This matches the `owns_grievances` refusal for a grievance owner. The message gives the counts, never which reviews: "<name> is the reviewer on 1 open review and responsible for 2 open CAPs. Give them to someone else before archiving." When the only open items are on a review hidden from the account archiving, the refusal gives the general reason with no counts.
- **The counts:** `openReviewsReviewing` and `openCapsResponsible` are added to `EmployeeRow`. `employeeFor` sets them to zero for an account that cannot use Reviews, as it already does with `openGrievancesOwned`. Reviews about the viewer's own employee are left out of both.
- **Done when:** tests cover both refusals, the hidden counts, and that neither refusal reveals a hidden review.

### Slice 6.3: Review Audit Log page and export

- **`GET /api/reviews/audit`** and **`/audit.csv`**, served by `listReviewAudit`. It shares `auditWhere` and `ACTOR` with the other two logs. Entries whose `review_id` is a review about the viewer's employee are left out.
- **`/reviews/audit`** uses the shared `AuditLog` component. Each entry links to the review or CAP it describes.
- **Done when:**
  - every action in `REVIEW_AUDIT_ACTIONS` is written by at least one test;
  - the employee reviewed sees none of their review's entries, in the page or in the CSV.

### Where Phase 6 differs from this plan

- **Completed refused while CAPs are open** is 409 `caps_open`, shown under the New status field rather than in an alert. Choosing the status the review already has is 409 `status_unchanged`.
- **The review's own fields can still be edited when it is Completed.** Only new CAPs, updates and files wait for it to be reopened. Each edit is on the history, as before.
- **Voiding clears `completed_at`**, like any status other than Completed. The history keeps when it was completed. A status change and a void share one helper, so both write the same "Status: A → B" entry, with the note or reason as its body.
- **The change sheet is shared:** the grievance's status sheet moved to `web/src/features/common/change-sheet.tsx`, and the review's Change status and Void sheets use it too.
- **The archive refusal code is `has_open_reviews`.**
- **A CAP on a voided review does not count**, for archiving or in the counts.
- **The counts are worked out for each viewer**, since reviews about the viewer are left out. So `listEmployees` and `getEmployee` now take the viewer.
- **An account without Reviews** sees zero counts, and gets the general refusal with no counts when it tries to archive someone with open review work.
- **In the audit log,** a file on a CAP links to its CAP as well as the review, and an export of Action items links to Action items. The CSV has the same columns as the Grievance Audit Log's.
- **Tests:** the `send` and `txt` helpers moved to the top of `server/tests/reviews.test.ts`, so the audit-log test can attach and withdraw files.

## 13. Phase 7: Output and finish

### Slice 7.1: Printable review report

- **`/reviews/$code/report`** sits outside the app's frame, as the grievance case file does. It contains:
  - the review's details, findings and body;
  - each CAP, with its responsible employee, due date, status, completed date and the names of its files;
  - the full history.
- It is saved as a PDF from the browser's print dialog.
- Each print is logged as `export`, through `POST /:code/exports`.
- **Done when:** a review with 10 CAPs prints cleanly in Chrome and Firefox, with no CAP split across two pages where that can be avoided.

### Slice 7.2: Seed, docs, end-to-end check

- **`server/review-seed.ts`** adds sample data, and runs the same way as the grievance seed:
  - a few reviews in each status;
  - CAPs in each status;
  - updates, a correction and some files;
  - one review about a sample account's own employee, to show it is hidden from them.
- **Docs:**
  - `PRODUCT.md` and `README.md`;
  - `DESIGN.md`, covering CAPs on the timeline and the CAP page;
  - `RUNBOOK.md`, noting that backups now also hold review files;
  - a line under Development requests in `TODO.md`.
- **End-to-end run** in headless Chromium:
  1. As an Edit account, create a review naming a reviewer.
  2. As the reviewer's Read Only account, add three CAPs, add an update with a file, and complete one CAP.
  3. Cancel another CAP.
  4. Complete the last CAP, then complete the review and print it.
  5. Sign in as the employee reviewed and confirm the review is nowhere: not in the list, Action items, audit log or search, and its link answers "not found".
- **Done when:** that whole run works at desktop width and at phone width.

### Where Phase 7 differs from this plan

- **The print pieces are shared.** The grievance case file's print gate, page header, entry block and files table moved to `web/src/features/common/printout.tsx`, and the case file and the review report both use them.
- **`POST /:code/exports` takes no body.** The report has one format, so there is nothing to choose.
- **The report has no "Include automatic entries" switch.** The history always prints whole, since the automatic entries record each CAP's changes.
- **The report ends with a Files table**, as the case file does: each file with its CAP, the entry that recorded it, its size, who added it and its SHA-256. Each CAP also lists its files by name.
- **Report link:** the review page shows it to every account that can read the review, next to Edit, Change status and Void.
- **Checked in Chrome only.** A 10-CAP review printed to 7 Letter pages with no CAP split. Firefox's print can't be driven headless, so it has not been checked.
- **The seed** gives Marcus Reviews Edit and Rosa Reviews Read Only, and adds five reviews in `server/review-seed.ts`, one per status plus a second Open one. AR-2026-0003 is about Marcus's own employee, so it is hidden from him.
- **`/reviews/employees` was built in 7.2.** It was in the plan's screens and sidebar, but no slice had built it. It is the same Employees page as under Assets and Grievances.
- **The end-to-end run used the seeded accounts.** Marcus was the Edit account, Rosa the reviewer and Priya, a Super Admin, the employee reviewed. It also checked that completing the review is refused while CAPs are open. It ran in Chromium only, at 1400 and 390 px wide.

## 14. Questions

### Your answers

| # | Question | Answer |
|---|---|---|
| Q2 | What a review records | **Your answer:** Title, Summary, Review date, Reviewed by, Employee reviewed, Findings, and a Review body written in the rich-text editor. I read "Employee reviewed" as one employee per review. |
| Q5 | Who can work on CAPs | **Your answer:** Super Admins, anyone with Edit, and the Reviewed by employee's linked account. I gave the reviewer's account the whole review, as a grievance owner's account has the whole grievance (Q19). The CAP's responsible employee gets no extra rights. |
| Q6 | Sign-off, and who may see a review | **Your answer:** employees can neither edit nor read their own review. That is R9, and it applies to Super Admins too (Q17). There is still no separate Verified step: marking the review Completed is the sign-off. |
| Q8 | Is evidence required? | **Your answer:** a CAP works like an Action or Event, with a similar form and page. Files can be added but are not required. |
| Q14 | Reminders | **Your answer:** no flags yet, because there is no notification system. Overdue is not shown anywhere (R10). |
| — | Linked accounts | **Your new rule:** every account must be linked to an employee, except the first account (slice 1.3). |
| Q15 | Findings and Review body | **Accepted:** Findings is plain text, several lines, up to 2,000 characters: the conclusion, shown near the top of the review and the report. The Review body is the full write-up, in the rich-text editor. |
| Q16 | The employee reviewed as a CAP's responsible employee | **Accepted:** allowed, because a corrective action is often theirs to do, such as completing a training. They still cannot see the review or the CAP, so the reviewer records their progress. |
| Q17 | R9 and Super Admins | **Accepted:** a Super Admin does not see a review about themselves (section 17). |
| Q18 | Accounts not linked today | **Your answer:** on the live system every account is already linked, except the first. So nothing needs fixing, and the "Not linked" badge is dropped from slice 1.3. The server rule stays: an unlinked account other than the first has None in Reviews. |
| Q19 | What the reviewer's account can do | **Your answer:** the whole review, like a grievance owner: edit the details, add and change CAPs, add updates and files, and change the status. Only void and withdraw need Full. |

### Proposals you did not change

I will build these as proposed.

| # | Question | Proposed answer |
|---|---|---|
| Q1 | Name and IDs | "Administrative Reviews" in the switcher, the sidebar and the tab title. Reviews are numbered `AR-2026-0001`. CAPs are numbered `AR-2026-0001-CAP01`, shown on the review as CAP01. |
| Q3 | Review statuses | Open, In progress, Completed and Voided. A review can be marked Completed only when every CAP is Completed or Cancelled. |
| Q4 | What a CAP records | Title, Short description, Details (optional), one Responsible employee, Due date (optional), and a status: Not started, In progress, Completed or Cancelled. |
| Q7 | Completion date | Stamped automatically when a CAP is marked Completed, and not editable. To record when the work was actually done, an update can be back-dated. |
| Q9 | Files | Files go on a CAP, on an update, or on the review. Same types and limits as grievance files: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, up to 10 MB each and 10 at a time. A file can be withdrawn with Full, and is never deleted. |
| Q10 | Exports | A printable report for each review, saved as a PDF, and the Action items list as CSV or Excel. No Excel workbook per review. |
| Q11 | Audit log | A separate Review Audit Log, as Grievances has. |
| Q12 | Where "Read Only" shows | Everywhere a level is named: both sheets, the Users table and the account summary. |
| Q13 | Which rows get the "i" button | Every section's row, including Employees. Not the "Set all to" row. |

## 15. Not included

- Notifications, reminders, escalation and overdue flags (Q14). They come with the planned notification work. Due dates are recorded now, so that work has what it needs.
- Limiting who can see a review beyond R9, for example to named people only.
- An employee seeing their own review, or the CAPs on it (Q6).
- A Type or Category list, programs or locations on a review.
- A Verified step for each CAP, separate from completing the review (Q6).
- Recurring CAPs, or templates for them.
- An Excel workbook per review. It is easy to add later by copying the grievance workbook, removed in `41bf4de` and still in the history.
- Importing reviews from another system.
- Images inside the rich text. They go in as attached files.

## 16. Where the build stops for you

| After | What you are asked |
|---|---|
| Phase 1 | Look at the selectors, the "i" texts and the Link employee sheet. Phase 1 can be deployed on its own. |
| Slice 2.2 | Look at the switcher with four workspaces. |
| Slice 4.2 | Try a review with CAPs three ways: with an Edit account, as the reviewer's Read Only account, and as the employee reviewed, who should see nothing. |
| Phase 5 | Try adding files to a CAP and to an update. |
| Slice 7.1 | Look at a printed report. |
| Each other phase | A short demo, and your go-ahead for the next phase. |

## 17. Things to know before approving

- **Hiding a review from its employee depends on accounts being linked correctly.** If an account is linked to the wrong employee, that person sees reviews about the employee they are wrongly linked to, and nothing hides their own. Nobody can change their own link, and every link change is in the audit log. Still, a Super Admin who changes another account can link it to anyone, so the rule protects against curiosity, not against a determined Super Admin.
- **Anyone with Read Only or higher in Reviews sees every other review.** That includes reviews about their colleagues and about the people who report to them. Give Reviews access only to those who should see it.
- **The CAP's responsible employee has no extra rights** (Q5). If they have only Read Only, someone with Edit, or the reviewer, records their progress.
- **Edits keep the earlier text in the history, not on a versions page** as Grievances does. That is less to build, and the old text is shown where the change happened. What it cannot do is show a whole review side by side with an earlier version.
- **Files make every backup larger,** as grievance files already do.
- **Existing accounts start at None in Reviews.** After the deploy only Super Admins can see the workspace; give other accounts access on Users.
- **Slice 1.3 changes account creation for everyone.** From then on, a new account needs an employee record first. Someone who is not in the Employees directory, such as an outside contractor, has to be added there before they can have an account. A shared account, like Ops Account in the sample data, has to be linked to the employee who uses it.
- **Deploying runs three new migrations.** They only add tables. Deploy as usual with [DEPLOY-GUIDE.md step 13](DEPLOY-GUIDE.md#13-deploy-later-updates), which takes a backup first.
- **Slice 2.1 moves grievance code:** the upload checks, the file list, the people picker, the timeline and the entry form. Tests cover the move, and the grievance pages are compared before and after. They should not change, apart from the reworded message for a refused file type.
