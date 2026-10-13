# Implementation plan: Employee Grievance Tracker

Status: **Phases 1, 2 and 3 done 2026-10-12 and phase 4 done 2026-10-13; next is slice 5.1.** The Grievances workspace has its own sidebar, the Grievance Audit Log table and its writer, the grievance tables, a working Categories page, a New grievance page that saves and lands on the new grievance, the list with its tabs, filters and search, and a detail page reached from the ID or the title in the list. The detail page shows the grievance's timeline with a filter, an order switch and a summary beside it; entries can be added, opened on a page of their own, and corrected by a later entry. The owner or a Super Admin can change a grievance's status and owner, and a Super Admin can void it. A grievance can be edited, with earlier versions kept. An employee named on a grievance cannot be deleted, and the owner of one that is not closed cannot be archived. Written against `main` at `bb028a3`.

Built one slice at a time. Every slice ends with `bun run typecheck` and `bun run test` green and its own commit, so work can stop or change direction after any of them. Phases are in build order; a later phase never has to reopen an earlier one.

## Progress

A slice is ticked when it is finished and committed.

- [x] 1.1 Feasibility checks (2026-10-12)
- [x] 1.2 Rich text, end to end (2026-10-12)
- [x] 1.3 People pickers (2026-10-12)
- [x] 1.4 Workspace shell, permissions, audit writer (2026-10-12)
- [x] 2.1 Data and categories (2026-10-12)
- [x] 2.2 Create (2026-10-12)
- [x] 2.3 Browse (2026-10-12)
- [x] 2.4 Detail (2026-10-12)
- [x] 3.1 Data and add-entry (2026-10-12)
- [x] 3.2 Timeline (2026-10-12)
- [x] 3.3 Entry detail and corrections (2026-10-12)
- [x] 4.1 Status and ownership (2026-10-12)
- [x] 4.2 Edit with versions (2026-10-13)
- [x] 4.3 Guards on employees (2026-10-13)
- [ ] 5.1 Audit log page and export
- [ ] 6.1 Attachment storage and upload
- [ ] 6.2 Download and withdraw
- [ ] 7.1 PDF case file
- [ ] 7.2 Excel workbook
- [ ] 8.1 Seed, docs, end-to-end check

## 1. Decisions made

| # | Question | Decision |
|---|---|---|
| G1 | Who can use it | **Both roles see every grievance** (confirmed 2026-10-12: only trusted management and IT staff have accounts). Any Admin can create a grievance and add actions, events and attachments to any grievance. Voiding a grievance and withdrawing an attachment are Super Admin only. |
| G1a | Who can change a grievance | **Only the owner's account and Super Admins** can edit a grievance's details, change its status or reassign its owner. "The owner's account" is the account linked to the employee named as Owner. Everyone else sees those controls disabled with the reason. |
| G2 | Editing and deleting | **Append-only trail.** An action/event is never edited or deleted; a mistake is fixed with a Correction entry linked to the original. A grievance can be edited, and every earlier version is kept and viewable. Nothing is deleted: a grievance is closed, or voided with a reason. |
| G3 | IDs | **Generated.** Grievance `GR-2026-0001`; its entries `GR-2026-0001-E01`, `-E02`, ... Shown read-only, never typed, never edited, never reused. |
| G4 | Timestamp | **Two times per entry.** *Occurred at* is entered (defaults to now, may be earlier, never in the future). *Recorded at* is set by the server and never changes. |
| G5 | Export | **PDF case file** and **Excel workbook**, per grievance. |
| G6 | Extras included | Status with automatic timeline entries; Category and table filters; Action vs Event type; Attachments. |
| G7 | Documented By | The employee linked to the signed-in account. **If the account has no linked employee, the account's name and email are recorded instead.** |
| G8 | Audit | **A separate Grievance Audit Log**, in the style of the existing one. It records grievance activity only, and the existing Audit Log records none of it. |
| G9 | Separation from the asset side | **Two workspaces, one sign-in** (see section 2). |
| G10 | Attachment storage | **Inside the database** for now. To be revisited if backup size becomes a problem; slice 6.1 keeps the bytes behind one small storage module so moving them to files later does not touch the screens or the API. |
| G11 | Design bar | **The rich-text editor and the action/event timeline are the two showpiece surfaces.** Each gets a design slice with your sign-off before it is built (slices 1.2 and 3.2). |

Decisions I am proposing and will follow unless you change them are in section 11.

## 2. How the two areas are kept apart

The app becomes two **workspaces** behind one sign-in: **Assets** (everything that exists today) and **Grievances**. A person is in one or the other, never looking at a mix.

- **Switcher:** a two-part control at the top of the sidebar, under the product name: *Assets* | *Grievances*. Choosing one replaces the whole sidebar and goes to that workspace's first page. The app reopens in the workspace last used.
- **Its own sidebar:** in the Grievances workspace the sidebar holds only *Grievances*, *Categories* and *Audit log*. None of the asset entries are there, and the Assets sidebar has no grievance entries.
- **Unmistakable which side you are on:** the workspace name sits in the page header and the browser tab title ("Grievances · BPHS"), and the sidebar carries a "Confidential" line. Same typography, spacing and components as the asset side, so it is one product; a different accent colour on the switcher and active nav item so the two are never confused at a glance.
- **What stays shared:** sign-in, the account menu, and the Users screen (an account is app-wide). People are picked from the one Employees directory; employees are still added and archived on the asset side.
- **URLs and code:** everything lives under `/grievances/...` and `/api/grievances/...`, with its own layout route, `web/src/features/grievances/`, and its own server routes and services. All grievance code, including the editor, is loaded only when the workspace is opened.
- **Data:** new tables only, all prefixed `grievance_`. No existing table changes shape.
- **Nothing crosses over:** grievances do not appear on Overview, Lists, Import/Export, the Employees page or the existing Audit Log, and no asset screen links into the Grievances workspace.

Considered and not chosen: a fourth group in the existing sidebar (cheapest, but grievances would sit one click from laptop assignments on every screen, which is the opposite of isolated); and a second app on its own port with its own sign-in (strongest separation, but two sets of accounts, two deployments and two backups for the same five people).

## 3. What gets built (screens)

| Route | Screen |
|---|---|
| `/grievances` | Browse table with filters and search |
| `/grievances/new` | Create (full page) |
| `/grievances/GR-2026-0001` | Detail: facts, full body, attachments, timeline |
| `/grievances/GR-2026-0001/edit` | Edit (full page, asks for a reason) |
| `/grievances/GR-2026-0001/versions` | Earlier versions of the grievance |
| `/grievances/GR-2026-0001/entries/new` | Add action/event (Grievance ID set and locked) |
| `/grievances/GR-2026-0001/entries/E03` | One entry in full |
| `/grievances/GR-2026-0001/case-file` | Print layout for the PDF export |
| `/grievances/categories` | Grievance Categories |
| `/grievances/audit` | Grievance Audit Log |

**Browse table columns** (required ones in bold): **Grievance ID** (link), **Title** (category shown small beneath), **Short Description** (one line, cut with an ellipsis, full text on hover), **Date Made**, **Employees Involved**, **Management Involved**, **Owner**, Status, Last activity. People cells show the first two names and "+N". **Body Text is not a column**: the row has an expander showing a plain-text preview of about 300 characters, and the ID and title open the detail page with the formatted body.

**Timeline:** a single vertical line, oldest first (with a toggle for newest first), one card per entry: entry ID (link), type badge (Action, Event, Correction, or a quieter style for automatic entries), title, short description, occurred-at time, Documented By, attachment count. When recorded-at differs from occurred-at by more than a day the card says "recorded 3 days later". A Correction card links to the entry it corrects, and the corrected entry shows "corrected by E07". A tree was considered and rejected: entries do not branch.

## 4. Phase 1: Groundwork

Shared pieces every later phase needs. No grievance screen exists at the end of this phase beyond an empty section.

### Slice 1.1: Feasibility checks (no product code)

- Four checks on a throwaway branch before anything is built on them, each ending in a yes or a named fallback.
- Rich-text editor: Tiptap, bundled from npm, under `script-src 'self'` on a production build; maintenance, advisories and bundle size; loaded only on grievance pages.
- Server HTML sanitiser: `sanitize-html` on Node 24 with the slice 1.2 allow-list.
- Excel: `write-excel-file` 4.1.1 writing several sheets with text-only cells.
- Print to PDF: clean page breaks in Firefox and Chrome. Page numbers come from the browser's print footer, not CSS page-number boxes (Firefox does not support them).

**As built (2026-10-12).** All four are a yes, no fallback: Tiptap 3.31.4 and `sanitize-html` 2.18.0 run under the app's real Content Security Policy, `write-excel-file` 4.1.1 writes several text-only sheets in one workbook, and Firefox and Chrome print the same pages.

- **Slice 7.1.** Three rules, each needed for Firefox: (a) the running header is a table header row (`thead`), which both browsers repeat on every page; a `position: fixed` header was tried and rejected (Firefox does not show it, Chrome overlaps it with text). (b) The cover sits in its own table row with `break-after: page` on the row; a forced break on a block inside a cell is ignored by Firefox. (c) Firefox ignores `break-after: avoid`, so a heading is kept with what follows by wrapping the two in a `break-inside: avoid` block.
- **Slice 7.1, cosmetic.** Firefox sometimes starts a new page earlier than it has to, leaving white space at the foot of a page. Nothing is cut or split. To be tuned when the real layout exists.
- **Slice 7.1, not checked.** The page-number footer in Firefox comes from its print dialog, which a headless run does not have. It is on the browser check list for slice 7.1.
- **Slice 7.2.** The multi-sheet call is `writeXlsxFile([{ data, sheet, columns, stickyRowsCount }, ...])`.

### Slice 1.2: Rich text, end to end

- Design first, with sign-off: two or three editor directions mocked with real text (toolbar placement, chrome, reading typography shared by the editor and the read-only view, focus and error states, desktop and narrow widths). The choice goes in `DESIGN.md`.
- `shared/richtext.ts`: the allow-list (paragraph, line break, bold, italic, underline, strikethrough, headings 2 and 3, bulleted and numbered lists, block quote, links with `http`, `https` or `mailto` only; no images, inline styles or scripts) and an HTML-to-plain-text helper.
- `server/lib/richtext.ts`: sanitises on every write and stores the sanitised HTML and a plain-text copy (search, previews, Excel). What the browser sends is never trusted.
- `web/src/components/ui/rich-text.tsx`: the editor (toolbar matching the allow-list, shortcuts, screen-reader labels) and a read-only renderer of server-sanitised HTML only.
- Limit: 100,000 characters of body text.
- Done when: unit tests show script tags, event handlers, `javascript:` links and inline styles are stripped, and allowed formatting survives a save and reload.

**As built (2026-10-12).** The ruled field with a fixed bar was chosen; it is recorded in `DESIGN.md` under Components, Rich text.

- The editor is `RichTextEditor` and the read-only view `RichTextView`, both from `web/src/components/ui/rich-text.tsx`. The editor works as the child of a `Field`. It is uncontrolled: `defaultValue` is read once and `onChange` gives the HTML, or an empty string when nothing is written.
- Tiptap loads only when an editor is shown (about 128 kB gzipped, in its own file). The read-only view costs nothing.
- An empty body is refused with `422 body_required` and one over the limit with `422 body_too_long`. The count under the editor uses the same plain-text helper as the server.
- The server sets `rel` and `target` on links itself, and drops empty paragraphs at either end of a body. The plain-text helper puts a line break between blocks.

### Slice 1.3: People pickers

- `web/src/components/ui/combobox.tsx`: a multi-select variant with removable chips, built on the single-select. Name and Employee ID search, active employees only.
- Done when: usable with Tab, arrows, Enter and Backspace alone.

**As built (2026-10-12).**

- `MultiCombobox` in `web/src/components/ui/combobox.tsx` is the general chip picker; it shares its search and list with the single-select `Combobox`.
- `PeoplePicker` in `web/src/features/grievances/people-picker.tsx` is the one the grievance forms use: active employees only, searched by name and Employee ID, with `exclude` to keep out people in the grievance's other list. It works as the child of a `Field`.
- Enter adds the highlighted match only while the list is open; otherwise it submits the form. Left arrow walks back through the chips, Delete or Backspace removes the one in focus, Home and End jump along them. Chips are not tab stops.
- No unit tests: the project has no browser test environment (vitest covers `server/` and `shared/` only), so browser behaviour is checked in real browsers.

### Slice 1.4: Workspace shell, permissions, audit writer

- `web/src/components/shell/app-shell.tsx`: the switcher, and the nav built per workspace. The workspace is derived from the URL (anything under `/grievances`), so links, reloads and the back button land on the right side.
- `web/src/routes/_app/grievances.tsx`: the workspace's layout route (page-title suffix, lazy loading).
- `web/src/styles.css`: the second accent as a token, scoped to the Grievances workspace.
- `shared/permissions.ts`: permission `grievance.void` (Super Admin), and `canManageGrievance(user, ownerEmployeeId)`, true for a Super Admin or the account linked to the owner; used by server and browser.
- Migration `0007_grievance_audit`: `grievance_audit_log`, same columns as `audit_log`.
- `server/lib/grievance-audit.ts`: `writeGrievanceAudit`, called in the same transaction as the change. Grievance services never call `writeAudit` and nothing else calls `writeGrievanceAudit`; a test enforces both.
- `server/routes/grievances.ts` mounted at `/api/grievances` in `server/app.ts`.
- Done when: both roles can switch, each sidebar shows only its own entries, a reload stays in the workspace, the asset screens look as before, and a signed-out request gets 401.

**As built (2026-10-12).**

- **Colour: Grievances uses the same cobalt as Assets for now.** Plum and an orange were tried and turned down. The token `--color-workspace` stays, so a colour can be set later in one place.
- A nav entry is added to `useNav` in `app-shell.tsx` by the slice that builds its page (slice 5.1 adds Audit log), so the sidebar never links to a page that is not there.
- Grievance pages set their tab title with `useGrievancePageTitle(page?)` from `web/src/features/grievances/page-title.ts`.
- `useWorkspace()` in `web/src/lib/workspace.ts` gives the workspace from the address. Dialogs and popovers are drawn outside the shell, so one that uses `--color-workspace` must carry `data-workspace` itself, as the drawer does.
- The workspace last used is the one thing kept in browser storage (its name only), applied once, when the app is opened at `/`.
- The Issue and Return sheets still belong to the shared shell, so `?issue=` in a grievance address would open one. No screen links that way.
- `GRIEVANCE_AUDIT_ACTIONS` in `shared/constants.ts`: create, update, delete, status, owner, void, entry, attach, withdraw, download, export. Later slices may add to it.
- `grievance_audit_log` is append-only by trigger, on the same terms as `audit_log`.
- The test that keeps the two logs apart reads the source: a server file whose name starts with `grievance` must not mention `writeAudit` or `auditLog`, and no other file may mention `writeGrievanceAudit` or `grievanceAuditLog`. So grievance server files must keep that name prefix.

## 5. Phase 2: Grievance records

### Slice 2.1: Data and categories

- Migration `0008_grievances`:
  - `grievance_categories`: `id`, `name` (unique), `is_active`. Seeded in the migration, since production runs on live data: Conduct, Pay and hours, Health and safety, Discrimination or harassment, Working conditions, Other.
  - `grievances`: `id`, `code` (unique), `year` and `seq` (unique together), `title` (up to 150), `short_description` (up to 300), `body_html`, `body_text`, `date_made` (`YYYY-MM-DD` text, so time zones cannot shift it), `owner_id` → employees, `category_id`, `status`, `version` (starts at 1), `created_by_user_id`, `created_at`, `last_activity_at`.
  - `grievance_people`: `grievance_id`, `employee_id`, `role` (`employee` or `management`), unique on all three.
- ID generation: inside the create transaction, `seq` is the highest for the current year plus one; SQLite's single writer and the unique index stop duplicates. The year is the year the record was entered, not Date Made.
- `web/src/routes/_app/grievances.categories.tsx`: the Categories page. Same list component and rules as the Lists screen (rename, deactivate, delete only if unused, last active one cannot be removed) but not shown there; its changes go to the Grievance Audit Log.

**As built (2026-10-12).**

- Any Admin can add, rename and deactivate a category; deleting needs a Super Admin (`record.delete`). The API is `/api/grievances/categories`, in `server/services/grievance-categories.ts`. Audit entries use the entity type `category`.
- `nextGrievanceCode(tx, at?)` in `server/services/grievances.ts` gives `{ code, year, seq }` (the server's local year); `grievanceCode(year, seq)` in `shared/constants.ts` formats it.
- `GRIEVANCE_STATUSES` (`open`, `in_progress`, `resolved`, `closed`, `voided`) and `GRIEVANCE_PERSON_ROLES` are in `shared/constants.ts`; the database checks both.
- `owner_id`, `category_id` and `grievance_people.employee_id` are `ON DELETE RESTRICT`; `grievance_people` rows go with their grievance.
- The list parts (`EditableName`, `AddRow`, `ActiveSwitch`, `DeleteButton`) are in `web/src/features/common/list-parts.tsx`, shared with the Lists screen.
- `grievanceCategoriesQuery` in `web/src/lib/queries.ts` returns inactive categories too, with a count each; forms offer the active ones only.

### Slice 2.2: Create

- `shared/schemas.ts`: `grievanceCreateSchema`. Title, short description, body, date made, owner and category required; at least one Employee Involved and one Management Involved; nobody in both lists; Date Made not in the future.
- `server/services/grievances.ts`: `createGrievance` writes the grievance, its people, the automatic entry E01 "Grievance recorded" and an audit entry in one transaction.
- `web/src/routes/_app/grievances.new.tsx`: full page. Grievance ID shown as "Assigned when saved"; Title and Short Description with character counts; date picker defaulting to today; two people pickers; Owner; Category; the editor.
- Leaving with unsaved text asks first. Nothing is saved to browser storage, because these are sensitive and machines may be shared.
- Done when: either role can create a grievance and reopen it with formatting intact; every validation rule has a test.

**As built (2026-10-12).**

- `POST /api/grievances` answers 201 with a `GrievanceDetail` (in `shared/types.ts`); `getGrievance` takes `{ code }`. `localToday` is in `shared/schemas.ts`.
- An archived employee is refused in either people list and as owner (422 on that field); an inactive category answers 409 `category_inactive`.
- The warning when the owner is also named on the grievance is a note under the Owner field, not a block.

### Slice 2.3: Browse

- `GET /api/grievances` with server-side `status`, `owner`, `category`, `from`, `to` and `q`. Returns no body HTML, only the 300-character preview.
- `web/src/routes/_app/grievances.index.tsx`: the table in section 3, status tabs (Open, In progress, Resolved, Closed, All), owner and category filters, date range, search, row expander, empty states.

**As built (2026-10-12).**

- The answer is `{ rows, counts, owners }` (`GrievanceList` in `shared/types.ts`). `counts` is per status and for all, under the other filters; `owners` is everyone who owns a grievance.
- **The page opens on the Open tab.** Voided grievances appear under All only. `status=all` is the server's default.
- `from` and `to` are days, both inclusive, compared with Date Made. Search splits on spaces and every word must be found somewhere: ID, title, short description, body text, or the name of the owner or anyone named.
- The whole match is returned and paged in the browser, 25 to a page. If the volume ever calls for it, `limit` and `offset` go on the query as in the Audit Log.
- The filters live in the address; typing in the search replaces the history entry, as on the Audit Log page.
- `GrievanceStatusBadge` is in `web/src/features/grievances/status.tsx`; `DataGrid` has a `detail` slot for a row beneath a row.

### Slice 2.4: Detail

- `GET /api/grievances/:code`.
- `web/src/routes/_app/grievances.$code.index.tsx`: header (ID, title, status, category), a facts panel (Date Made, Owner, Employees Involved, Management Involved, recorded by and when), the formatted body, and the timeline. An archived employee is still shown, marked "archived".

**As built (2026-10-12).**

- The ID in the address is matched in any letter case; an unknown one gets `GrievanceLoadError` (`web/src/features/grievances/load-error.tsx`), shared by every page under one grievance. TanStack Router logs the caught loader error to the console; the page shown is the right one.
- Reading a grievance writes nothing to the Grievance Audit Log.
- The header does not carry the workspace name; the rail or top bar and the back link already say Grievances.
- The short description is shown under the title.

## 6. Phase 3: Actions and events

### Slice 3.1: Data and add-entry

- Migration `0009_grievance_entries`: `grievance_entries` with `id`, `grievance_id` (required, restrict), `seq` (unique per grievance), `kind` (`action`, `event`, `correction`, `system`), `corrects_entry_id` (corrections only), `occurred_at`, `recorded_at`, `title`, `short_description`, `body_html`, `body_text`, `documented_by_employee_id` (nullable), `documented_by_user_id` (required), `documented_by_label` (name as it was at the time). The service has no update or delete path.
- The migration back-fills E01 for grievances created before this slice.
- `POST /api/grievances/:code/entries`. Documented By is taken from the session, never from the request.
- `web/src/routes/_app/grievances.$code.entries.new.tsx`: Grievance ID and title locked at the top; Type (Action or Event); Occurred at (defaults to now); Title; Short Description; the editor.

**As built (2026-10-12).**

- **The table itself is append-only**, by triggers on the same terms as the audit logs. The one change let through is the foreign key clearing `documented_by_employee_id` when that employee is deleted. A fourth trigger refuses a correction that points at another grievance's entry, and a check constraint ties `corrects_entry_id` to `kind = 'correction'`.
- `appendGrievanceEntry` in `server/services/grievance-entries.ts` is used inside another transaction and moves `last_activity_at`. Automatic entries (`kind = 'system'`) are written through it, with an empty short description.
- **Details (the body) are optional on an entry**; Title and Short description are required.
- Occurred at is sent as an instant (ISO, with offset) and may be back-dated without limit, but not in the future (five minutes of clock slack).
- Documented By is the signed-in account's name as it was at the time (`documented_by_label`), with the account's linked employee, if any, in `documented_by_employee_id`. Extra fields in the request are ignored.
- A Closed or Voided grievance answers 409 `grievance_sealed`; the page hides the button and shows a notice in place of the form.

### Slice 3.2: Timeline

- Design first, with sign-off: the viewer mocked against a long case (20 or more entries of every type, a correction, attachments, a back-dated entry). Decided: card and rail treatment, telling entry types apart without colour alone, date grouping, how much shows before opening, how corrections are tied to what they correct, density and print appearance (slice 7.1 reuses it). The choice goes in `DESIGN.md`.
- The timeline on the detail page, with "Add action/event" above it and a type filter (All, Actions, Events, hide automatic).
- A sticky summary beside it on wide screens: status, owner, entry count, first and latest activity.
- Reduced motion and keyboard reading order checked; the timeline is a real list for screen readers.

**As built (2026-10-12).** The rail was chosen, with month markers, newest first with a switch to oldest first, and details opening in place. It is written up under "Timeline" in `DESIGN.md`.

- `GET /api/grievances/:code/entries` gives every entry with its body, and `corrects` and `correctedBy` as entry numbers, for either role, nothing audited. `Timeline` and `TimelineSummary` are in `web/src/features/grievances/timeline.tsx`.
- The page fetches all of a grievance's entries in one request and draws 25 at a time, with a "Show 25 more" button. Nothing is paged on the server.
- The summary shows the grievance's Date made as "Grievance date". "First activity" and "Latest activity" are the earliest and latest Occurred at, so a back-dated entry moves the first.
- The order switch is remembered per browser (`localStorage`, key `grievance-timeline-order`).
- Actions or Events alone hide automatic entries, and keep a correction with the type of the entry it corrects.
- Attachments in the mock are not built; the attachments slice adds them to the entry and to this list.

### Slice 3.3: Entry detail and corrections

- `web/src/routes/_app/grievances.$code.entries.$seq.tsx`: every field, full body, previous and next entry links, and back to the grievance.
- "Add correction" on an entry opens the add form with Type fixed to Correction and the original linked. The original text is never changed or hidden.
- Done when: a test proves no API route can change or remove an entry, and an entry cannot be created without a valid grievance.

**As built (2026-10-12).**

- An entry's address uses its number as the pages show it: `/grievances/GR-2026-0001/entries/E06`. A bare `6` is read the same way. The add form takes `?corrects=6`.
- Previous and Next follow the entry numbers (the order recorded), not the order things happened.
- Both ends of a correction show the link, on the entry pages and as "Corrects" and "Corrected by" chips on the timeline. The original's text is shown in full either way.
- A correction is `kind: 'correction'` with `correctsSeq`, and its Occurred at is the moment it is written. An automatic entry cannot be corrected; a correction can be. A Closed or Voided grievance offers no button.
- The entry page reads the same one request as the timeline.
- The test in `server/tests/grievances.test.ts` ("adding to the timeline") expects the only routes with `/entries` in them to be one GET and one POST. A later slice that adds one must update it.

## 7. Phase 4: Lifecycle and history

### Slice 4.1: Status and ownership

- Statuses: Open → In progress → Resolved → Closed, and Voided. The owner's account or a Super Admin can move between the first four, including reopening. A note is optional except on Close.
- Changing the owner is its own action with an optional note, under the same rule; handing a grievance on ends the previous owner's ability to change it.
- Everyone else sees the controls disabled with "Only the owner (name) or a Super Admin can do this." The server answers 403 whatever the page shows.
- An owner with no linked account means only Super Admins can change the grievance; the create and reassign forms say so.
- Each change writes an automatic timeline entry ("Status: Open → In progress", "Owner: A → B") with the note as its body, and an audit entry.
- **Void** (Super Admin, reason required): the grievance becomes read-only and drops out of the default view.

**As built (2026-10-12).**

- `POST /api/grievances/:code/status` (`{ status, note }`), `/owner` (`{ ownerId, note }`) and `/void` (`{ reason }`, Super Admin) each answer with the grievance as it now is. `GET /api/grievances/account-holders` lists the employees an active account is linked to.
- `findToManage` in `server/services/grievances.ts` is the one check of who may: 403 with the words from `grievanceManageReason` in `shared/permissions.ts`, and 409 `grievance_voided` for a voided grievance. `applyChange` writes the update, the automatic entry and the audit entry in one transaction.
- A status can move to any of the other three, in any order; moving to the status it already has is 409 `status_unchanged`.
- A Closed grievance takes no change of owner (409 `grievance_sealed`); it is reopened first. The new owner must be an active employee, and not the current one.
- A note or reason is plain text, 2,000 characters at most (`GRIEVANCE_NOTE_MAX`). `plainToRichText` in `server/lib/richtext.ts` turns it into the entry's body, escaped. The timeline shows it under the automatic entry's line, with who made the change.
- The audit entry's details are the ID, the title and the change ("Status: Open → Closed"), never the note.
- `GrievanceDetail.ownerHasAccount` is false when no active account is linked to the owner; the Owner fact, the create form and the Change owner sheet then say only a Super Admin can change the grievance (`ownerAccountNote`). An account that has been turned off counts as no account.
- `web/src/features/grievances/manage.tsx` holds the buttons and their sheets (`GrievanceActions`), in the page header. A voided grievance shows a notice in their place.

### Slice 4.2: Edit with versions

- Migration `0010_grievance_versions`: `grievance_versions` with `grievance_id`, `version`, a full snapshot of the editable fields and people, `changed_by_user_id`, `changed_at`, `reason`.
- Editing is for the owner's account or a Super Admin (G1a), checked on the server. Closed and Voided grievances cannot be edited.
- `PATCH /api/grievances/:code` takes the version the editor loaded; if someone else saved meanwhile it answers 409 and the page offers to reload.
- Edit page: the create form pre-filled, plus a required "Reason for change". Saving stores the old version, bumps `version`, and writes an automatic entry naming the fields that changed.
- `grievances.$code.versions.tsx`: each earlier version in full, with who changed it, when and why.

**As built (2026-10-13).**

- `PATCH /api/grievances/:code` takes the seven editable fields, `version` and `reason`. `GET /api/grievances/:code/versions` lists what it said before each edit, the latest first, for either role. Both are in `server/services/grievance-versions.ts`, which goes through `findToManage`; slice 7.1's case file can read versions with `listGrievanceVersions`.
- `grievance_versions` holds the category's name and the people as role, Employee ID and name: text, not links, so a version reads the same whatever is later renamed or archived. It is append-only by triggers. Version N's row is what the grievance said as version N, with who replaced it, when and why.
- The owner and the status are not edited here; each keeps its own sheet.
- A save from a replaced version is 409 `stale_version`, naming who got in first. The page keeps what was typed, disables Save, and offers "Discard my changes and reload".
- A save that changes nothing is 409 `unchanged`. A Closed grievance is 409 `grievance_sealed`; a Voided one is 409 `grievance_voided`.
- Someone already named stays named after they are archived, and their chip says "(archived)"; only a person being added must be active. A category no longer in use stays on the grievance that has it, and is refused only when changed to.
- The automatic entry is titled "Edited: " and the fields that changed, with the reason as its body. The audit entry (`update`) has the ID, the new title and the same field names: never the reason, nor the text before or after.
- `GrievanceForm` in `web/src/features/grievances/form.tsx` is the form both the create and edit pages use.

### Slice 4.3: Guards on employees

- `server/services/employees.ts`: an employee named anywhere on a grievance (involved, management, owner, documented by) cannot be deleted. An employee who owns a grievance that is not Closed or Voided cannot be archived until it is reassigned.
- Tests for both; the existing employee rules still pass.

**As built (2026-10-13).**

- Delete: the count that blocks deleting also takes in entries documented by an account linked to the employee. The reason is "Named on a grievance. Archive instead; history is never deleted.", with no ID or title.
- Archive: an employee who owns a grievance that is not Closed or Voided is refused with 409 `owns_grievances` and a message that gives the number only. Closing it, voiding it or giving it another owner lifts the block.
- `EmployeeRow` gained `openGrievancesOwned`, so the Employees page shows the reason on the Archive menu item before it is tried.
- Known limit: an entry records who documented it by account, and by name as text, not by employee. Once the account is unlinked and nothing else names the employee, they can be deleted; the entry keeps the name. A test states this.
- Known limit: a former owner who is no longer named anywhere on the grievance can be deleted. The timeline keeps their name as text.

## 8. Phase 5: Grievance Audit Log

### Slice 5.1: Page and export

- `GET /api/grievances/audit` with the same filters as the existing log (date range, actor, action, text).
- `web/src/routes/_app/grievances.audit.tsx`: modelled on `audit.tsx`, with entries linking to the grievance or entry they describe. Read-only for everyone. CSV export of the filtered view.
- What it records: grievance created, edited (field names, not contents), status changed, owner changed, voided; entry added; attachment added, withdrawn, downloaded; case file or workbook exported; category list changes.
- Details hold the ID and title only, never body text.

Done when: every mutation in phases 2 to 4 has a test asserting one grievance audit entry and zero entries in `audit_log`.

## 9. Phase 6: Attachments

### Slice 6.1: Storage and upload

Migration `0011_grievance_attachments`:

- `grievance_attachments`: `grievance_id`, `entry_id` (nullable), `filename`, `content_type`, `size`, `sha256`, `uploaded_by_user_id`, `uploaded_at`, `withdrawn_at`, `withdrawn_reason`.
- `grievance_attachment_data`: the bytes, in their own table so lists never load them.
- `server/lib/grievance-files.ts`: the only code that reads or writes the bytes (`put`, `get`), so a later move to files on the data volume (G10) is a change to this one module plus a copy script.

- Limits: 10 MB a file, 10 files a request; PDF, PNG, JPEG, DOCX, XLSX, TXT and EML only, checked by content as well as by extension. The upload route gets its own body limit; the 4 MB limit on every other route is unchanged.
- Files are added on the create form, on the add-entry form (attached to that entry, in the same request so the entry is complete when saved), or later from the detail page, which writes an automatic timeline entry.

### Slice 6.2: Download and withdraw

- Downloads are always sent as a file to save, never displayed in the page, with `nosniff`, so an uploaded file cannot run as part of the app.
- **Withdraw** (Super Admin, reason required) for a file added by mistake: downloads stop, while the filename, who added it, the reason and a timeline entry remain.
- Shown as a list on the grievance and on each entry, with size and who added it.

## 10. Phase 7: Export, then Phase 8: finish

### Slice 7.1: PDF case file

- `grievances.$code.case-file.tsx`: a print layout outside the app shell. Cover block (ID, title, status, category, Date Made, owner, people), the full grievance body, then every timeline entry in order with all fields and full formatted body, then the attachment list (name, size, checksum, added by) and, optionally, earlier versions. Entries are kept together across page breaks where they fit. Every page carries the Grievance ID and "Confidential"; the last line reads "Exported by ... on ...".
- Options before printing: include automatic entries (on), include earlier versions (off).
- The user chooses "Save as PDF" in the browser's print dialog. No PDF library is added.

### Slice 7.2: Excel workbook

- `web/src/lib/spreadsheet.ts`: multi-sheet support.
- Sheets: **Grievance** (field and value), **Timeline** (one row per entry: Entry ID, Grievance ID, Type, Occurred at, Recorded at, Title, Short Description, Body as plain text, Documented By, Corrects), **Attachments**, **Versions**. All cells written as text, never formulas, as the existing exports do.
- Both exports write a Grievance Audit Log entry.

### Slice 8.1: Seed, docs, end-to-end check

- `bun run db:seed` gains a few fabricated grievances with timelines (development only).
- `PRODUCT.md` (terminology, rules, screen list), `README.md` (screens, routes), `DESIGN.md` (timeline, rich-text and chip-picker components), `RUNBOOK.md` (backups now hold grievance text and attachments and will grow; the off-box copies need the same care as HR files).
- Browser check on a production build, in Firefox as well as Chrome (slices 2.1 to 4.3 were checked in Chrome only): create, edit, add entries of each type, correct one, change status, void, upload and download, both exports opened, both audit logs inspected, keyboard-only pass, and a session expiring mid-edit without losing the text.

## 11. Proposed defaults: tell me if any is wrong

1. **Status changes and owner reassignment follow the same rule as edits** (owner's account or Super Admin). You asked for this on edits; I have extended it to these two because they also alter the grievance itself. Adding an action/event or an attachment stays open to every Admin.
2. **A Closed grievance takes no new entries until it is reopened.** Reopening is one click and is itself recorded.
3. **Category is required**, with "Other" available.
4. *(Settled: see G10.)*
5. **A withdrawn attachment's bytes stay in the database**, unreadable through the app. Permanently purging a file is not included.
6. **Viewing a grievance is not logged**; exports and attachment downloads are.
7. **A person cannot be in both Employees Involved and Management Involved** on the same grievance. The owner may be anyone, with a warning if they are also named on it.
8. **"Management" is a role on a grievance, not a property of an employee.** Any employee can be picked.
9. **No export of the browse table** (it was not selected). Easy to add later from the existing export definitions.

## 12. Not included

- Access limited to named people per grievance, or a separate HR role.
- Employees submitting or viewing their own grievances; employees still do not sign in.
- Email, reminders, due dates or escalation.
- Images inside body text (they go in as attachments).
- Importing grievances from another system.
- Encrypting grievance data at rest beyond what the host provides.
- Legal retention or disposal schedules.

## 13. Where the build stops for you

| After | What you are asked |
|---|---|
| Slice 1.1 | Nothing, unless a feasibility check fails; then the fallback is put to you |
| Slice 1.2 design | Pick the editor direction |
| Slice 1.4 | Look at the workspace switcher and the Grievances accent colour |
| Phase 2 | Try creating and browsing grievances |
| Slice 3.2 design | Pick the timeline direction |
| Each later phase | A short demo and the go-ahead for the next |

## 14. Things to know before approving

- **Every account can read every grievance** (G1, confirmed), including one made about or by the reader. Item 1 in section 12 is what changing that later would take; the workspace split in section 2 makes it a contained change.
- **Attachments make every backup copy larger** (G10): each nightly copy contains every file, and 30 days are kept on the host. `RUNBOOK.md` gets a line on watching backup size.
- **Backups become sensitive in a new way.** They already hold password hashes and employee data; they will also hold grievance text and attached documents.
- **The PDF depends on the browser's print dialog.** Page numbers and the exact look vary slightly between Firefox and Chrome. If an identical, server-generated PDF is ever required, that is a separate piece of work with a new dependency.
- **Slice 1.1 can change details of this plan** (which editor, which sanitiser). It cannot change what the screens do.
