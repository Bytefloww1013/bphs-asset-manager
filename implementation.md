# Implementation plan: Employee Grievance Tracker

Status: **Phase 1, Phase 2 and slice 3.1 done 2026-10-12; next is slice 3.2, which starts with a design sign-off.** The Grievances workspace has its own sidebar, the Grievance Audit Log table and its writer, the grievance tables, a working Categories page, a New grievance page that saves and lands on the new grievance, the list with its tabs, filters and search, and a detail page reached from the ID or the title in the list. Entries can be added to a grievance's timeline from its detail page, but the timeline itself is still a placeholder until slice 3.2. Written against `main` at `bb028a3`.

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
- [ ] 3.2 Timeline
- [ ] 3.3 Entry detail and corrections
- [ ] 4.1 Status and ownership
- [ ] 4.2 Edit with versions
- [ ] 4.3 Guards on employees
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

The brief says feasibility has not been checked. These are the four things that could change the plan, each proved in a throwaway branch before anything is built on it:

1. **Rich-text editor.** Candidate: Tiptap (bundled from npm, no CDN, so it works without internet). Confirm it runs under the app's Content Security Policy (`script-src 'self'`) on a production build, check its current maintenance and advisories, and measure the bundle; it is loaded only on grievance pages so other pages do not grow.
2. **HTML sanitiser on the server.** Candidate: `sanitize-html` (no browser DOM needed). Confirm it runs on Node 24 with the allow-list in slice 1.2.
3. **Multi-sheet Excel.** Confirm the installed `write-excel-file` 4.1.1 writes several sheets in one workbook with text-only cells.
4. **Print to PDF.** Confirm a print stylesheet gives clean page breaks in Firefox and Chrome. Page numbers come from the browser's own print footer; CSS page-number boxes are not relied on because Firefox does not support them.

Done when: each has a yes or a named fallback, written into this file.

**Results (2026-10-12): all four are a yes, no fallback needed.** Proved with two throwaway pages on a local spike branch (deleted afterwards, never merged), against a production build served by the app with its real Content Security Policy, in headless Firefox 157 and Chrome 155.

| # | Check | Result |
|---|---|---|
| 1 | Tiptap 3.31.4 under `script-src 'self'` | **Yes.** Every format in the allow-list applied from buttons, and Ctrl+B and list typing worked, in both browsers with no CSP violation. The built files contain no `eval` or `new Function`. It also runs with `injectCSS: false`, so it does not depend on `style-src 'unsafe-inline'`. |
| 1 | Maintenance and advisories | Latest release 2026-09-30, 80 stable releases in the past 12 months, MIT, about 22 million downloads a week. `bun audit` reports nothing for Tiptap or ProseMirror (the one advisory it lists is the esbuild one already on `main`, a development-only tool). |
| 1 | Bundle | The editor lands in its own lazily loaded file: **393 kB, 125 kB gzipped**. The entry file every page loads grew by 0.9 kB (0.25 kB gzipped), which is the route table. |
| 2 | `sanitize-html` 2.18.0 | **Yes**, on Node 24.21 (the app's container image) and Node 26. 19 hostile inputs (script, event handlers, `javascript:` in five spellings, `data:`, `vbscript:`, protocol-relative links, inline styles, `img`, `svg`, `iframe`, `style`, `form`, `math`, broken nesting) all came out clean; Tiptap's own output came back unchanged; a second pass changes nothing. 100,000 characters take 3 ms, 5,000 nested quotes 14 ms. Latest release 2026-09-30, MIT. |
| 3 | `write-excel-file` 4.1.1, several sheets | **Yes.** One workbook with the four sheets (Grievance, Timeline, Attachments, Versions), written in the browser under the CSP and read back sheet by sheet. Every cell is a text cell, no formula cells; `=1+1`, `+cmd|calc`, a line break and `0001` came back exactly as written. |
| 4 | Print to PDF | **Yes, with the layout rules below.** Firefox and Chrome both gave 8 Letter pages from the same page: the cover alone on page 1, the Grievance ID and "Confidential" at the top of every page, no entry split across pages, no heading left alone at the foot of a page. |

What these change in later slices (details only, no screen changes):

- **Slice 1.2.** Tiptap's StarterKit already includes links and underline, so no extra extension packages; code, code block and horizontal rule are switched off and headings limited to levels 2 and 3. The server sets `rel` and `target` on links itself and does not keep what the browser sent. A line break is stored as `<br />`. Reducing HTML to plain text cannot be a bare tag strip: that runs blocks together ("Headingplain"), so the helper puts a line break between blocks.
- **Slice 7.1.** Three rules, each needed for Firefox: (a) the running header is a table header row (`thead`), which both browsers repeat on every page; a `position: fixed` header was tried and rejected (Firefox does not show it, Chrome overlaps it with text). (b) The cover sits in its own table row with `break-after: page` on the row; a forced break on a block inside a cell is ignored by Firefox. (c) Firefox ignores `break-after: avoid`, so a heading is kept with what follows by wrapping the two in a `break-inside: avoid` block.
- **Slice 7.1, cosmetic.** Firefox sometimes starts a new page earlier than it has to, leaving white space at the foot of a page. Nothing is cut or split. To be tuned when the real layout exists.
- **Slice 7.2.** The multi-sheet call is `writeXlsxFile([{ data, sheet, columns, stickyRowsCount }, ...])`.

Not checked here: the page-number footer in Firefox. It comes from Firefox's own print dialog, which a headless run does not have; Chrome's footer printed "1/8" to "8/8". It is on the browser check list for slice 7.1.

### Slice 1.2: Rich text, end to end

**Design first (stops for your sign-off).** Before the component is built, two or three directions for the editor are mocked in the browser with real sample text and you pick one. What is being decided: toolbar placement (fixed above the text, or floating on selection, or both), how much chrome the writing area has, the reading typography (measure, line height, heading and quote styles) that the editor and the read-only view share so what is typed looks exactly like what is later read, focus and error states, and how it sits in the create page at desktop and narrow widths. The chosen direction is recorded in `DESIGN.md`.

- `shared/richtext.ts`: the allow-list (paragraph, line break, bold, italic, underline, strikethrough, headings 2 and 3, bulleted and numbered lists, block quote, links with `http`, `https` or `mailto` only). No images, no inline styles, no scripts. A helper that reduces HTML to plain text.
- `server/lib/richtext.ts`: sanitises on every write. The server stores the sanitised HTML **and** a plain-text copy (for search, previews and Excel). What the browser sends is never trusted.
- `web/src/components/ui/rich-text.tsx`: the editor (toolbar matching the allow-list, keyboard shortcuts, labelled for screen readers) and a read-only renderer that only ever displays server-sanitised HTML.
- Limit: 100,000 characters of body text.

Done when: unit tests show script tags, event handlers, `javascript:` links and inline styles are stripped, and allowed formatting survives a save and reload.

**Results (2026-10-12).** Three directions were mocked (a ruled field with a fixed bar, an open page with a floating bar, a headed page with both); **the ruled field was chosen** and is recorded in `DESIGN.md` under Components, Rich text. The mock page is deleted.

- Sanitising uses `sanitize-html`. 16 unit tests cover script and style removal, event handlers, twelve kinds of refused link, inline styles and classes, dropped tags, and the plain-text copy. A body that is empty is refused with `422 body_required` and one over the limit with `422 body_too_long`.
- Save and reload was checked in headless Chrome 155 against a production build with the real Content Security Policy: a body typed with keyboard shortcuts only, sanitised, loaded back into the editor and into the read-only view, comes back with the same formatting, and a second save is byte-identical. No grievance API exists yet, so the "save" was the sanitiser called directly; slice 2.3 exercises it through a real route. Not run in Firefox.
- Things later slices should know:
  - The editor is `RichTextEditor` and the read-only view `RichTextView`, both from `web/src/components/ui/rich-text.tsx`. The editor works as the child of a `Field`. It is uncontrolled: `defaultValue` is read once and `onChange` gives the HTML, or an empty string when nothing is written.
  - Tiptap loads only when an editor is shown (about 128 kB gzipped, in its own file). The read-only view costs nothing.
  - The count under the editor uses the same plain-text helper as the server, so the two agree at the limit.
  - The server drops empty paragraphs at either end of a body. Tiptap keeps one after a closing list or quote, and it would otherwise be stored.
  - The bar is one tab stop (arrow keys move along it, Alt+F10 reaches it from the text, Escape goes back), so Tab still leaves the field (in a list it indents the item instead).

### Slice 1.3: People pickers

- `web/src/components/ui/combobox.tsx`: a multi-select variant with removable chips, built on the existing single-select. Searches by name and Employee ID, offers active employees only, fully keyboard-operable.

Done when: it can be used with Tab, arrows, Enter and Backspace alone.

**Results (2026-10-12).** Checked on a production build with the keyboard alone, then with the pointer, in headless Chrome 155 and Firefox: 34 checks, all passing in both. The check page is deleted.

- `MultiCombobox` in `web/src/components/ui/combobox.tsx` is the general chip picker. It shares its search and its list with the single-select `Combobox`, which was refactored to use them and behaves as before.
- `PeoplePicker` in `web/src/features/grievances/people-picker.tsx` is the one the grievance forms use. It takes the employee list and offers only active employees, searched by name and Employee ID. `exclude` keeps out people who are in the grievance's other list. It works as the child of a `Field`.
- Things later slices should know:
  - Someone already chosen keeps their chip after they are archived, but the chip does not say "archived". The edit page in slice 4.2 should decide whether it needs to.
  - Enter adds the highlighted match only while the list is open. With the list closed, Enter submits the form, as in any text field.
  - The keys beyond the brief: Left arrow from the start of the text walks back through the chips, Delete or Backspace removes the chip in focus, Home and End jump along them. Chips are not tab stops, so one Tab leaves the field.
  - No unit tests: the project has no browser test environment (vitest covers `server/` and `shared/` only), so the behaviour was checked in real browsers instead.

### Slice 1.4: Workspace shell, permissions, audit writer

- `web/src/components/shell/app-shell.tsx`: the workspace switcher, and the nav built per workspace instead of one fixed list. The workspace is derived from the URL (anything under `/grievances` is the Grievances workspace), so links, reloads and the back button always land on the right side.
- `web/src/routes/_app/grievances.tsx`: the layout route for the workspace (page-title suffix, lazy loading of grievance code).
- `web/src/styles.css`: the second accent as a token, scoped to the Grievances workspace.
- `shared/permissions.ts`: new permission `grievance.void` (Super Admin), and `canManageGrievance(user, ownerEmployeeId)`: true for a Super Admin or the account linked to the owner. Server and browser both use this one function.
- Migration `0007_grievance_audit`: table `grievance_audit_log` with the same columns as `audit_log`.
- `server/lib/grievance-audit.ts`: `writeGrievanceAudit`, called inside the same transaction as the change it describes. Grievance services never call `writeAudit`, and nothing else calls `writeGrievanceAudit`; a test enforces both directions.
- `server/routes/grievances.ts` mounted at `/api/grievances` in `server/app.ts`, returning an empty list for now.

Done when: both roles can switch workspaces, each sidebar shows only its own entries, a reload stays in the same workspace, the asset screens look exactly as before, and a signed-out request gets 401.

**Results (2026-10-12).** Checked on a production build in headless Chrome 155 and Firefox, as a Super Admin and as an Admin: 37 checks, all passing in both. Screenshots are in `qa-shots/slice-1.4/` (not committed).

- The switcher sits under the product name in the rail and in the narrow-screen drawer. **Colour (decided 2026-10-12): Grievances uses the same cobalt as Assets for now.** Plum and an orange, rgb(241, 142, 49), were both tried and turned down; the orange was too faint as text (about 2.4:1). The token `--color-workspace` stays, used by the switcher's chosen half, the active nav icon and the "Confidential" line, so a colour can be set later in one place.
- On the Assets side the only visible change is the switcher itself: the eleven nav entries, the titles and the cobalt are as they were.
- Things later slices should know:
  - **The Grievances sidebar has one entry so far.** Categories and Audit log are added to `useNav` in `app-shell.tsx` by the slices that build those pages (2.1 and 5.1), so the sidebar never links to a page that is not there. The Grievances entry is not an exact match, so it will also light up on `/grievances/categories` until slice 2.1 sets that.
  - Grievance pages set their tab title with `useGrievancePageTitle(page?)` from `web/src/features/grievances/page-title.ts`: "Grievances · BPHS", or "GR-2026-0001 · Grievances · BPHS".
  - `useWorkspace()` in `web/src/lib/workspace.ts` gives the workspace from the address. Dialogs and popovers are drawn outside the shell, so one that uses `--color-workspace` must carry `data-workspace` itself, as the drawer does.
  - The workspace last used is the one thing kept in browser storage (its name only). It is applied once, when the app is opened at `/`.
  - The Issue and Return sheets still belong to the shared shell, so `?issue=` in a grievance address would open one. No screen links that way; slice 2.3 can move them to the Assets side if it matters.
  - "The workspace name in the page header" is met on narrow screens by the top bar ("BPHS Grievances") and on wide ones by the rail. Pages deeper than the list (slice 2.4 on) should decide whether their header also needs it.
  - `GRIEVANCE_AUDIT_ACTIONS` in `shared/constants.ts` is a first list taken from section 8: create, update, delete, status, owner, void, entry, attach, withdraw, download, export. Later slices may add to it.
  - `grievance_audit_log` is append-only by trigger, on the same terms as `audit_log`.
  - The test that keeps the two logs apart reads the source: a server file whose name starts with `grievance` must not mention `writeAudit` or `auditLog`, and no other file may mention `writeGrievanceAudit` or `grievanceAuditLog`. So grievance server files must keep that name prefix.

## 5. Phase 2: Grievance records

### Slice 2.1: Data and categories

Migration `0008_grievances`:

- `grievance_categories`: `id`, `name` (unique), `is_active`. Seeded in the migration (not the dev seed, since production runs on live data): Conduct, Pay and hours, Health and safety, Discrimination or harassment, Working conditions, Other.
- `grievances`: `id`, `code` (unique), `year`, `seq` (unique together), `title` (up to 150), `short_description` (up to 300), `body_html`, `body_text`, `date_made` (a calendar date stored as `YYYY-MM-DD` text, so time zones cannot shift it), `owner_id` → employees, `category_id`, `status`, `version` (starts at 1), `created_by_user_id`, `created_at`, `last_activity_at`.
- `grievance_people`: `grievance_id`, `employee_id`, `role` (`employee` or `management`), unique on all three.

ID generation: inside the create transaction, `seq` is the highest for the current year plus one. SQLite allows one writer at a time and the unique index backs it up, so two people saving at once cannot get the same ID. The year is the year the record was entered, not Date Made.

Also: `web/src/routes/_app/grievances.categories.tsx`, the **Categories** page in the Grievances workspace. It reuses the list component and rules from the Lists screen (rename, deactivate, delete only if unused, last active one cannot be removed) but does not appear on that screen. Its changes go to the Grievance Audit Log.

**Results (2026-10-12).** 122 tests pass (6 of them new, in `server/tests/grievances.test.ts`), and the typecheck is clean. Checked on a production build in headless Chrome 155 as an Admin and as a Super Admin: 17 checks, all passing. Firefox was not run for this slice. Screenshots are in `qa-shots/slice-2.1/` (not committed).

- Any Admin can add, rename and deactivate a category; deleting needs a Super Admin (`record.delete`), as on the Lists screen. The API is `/api/grievances/categories`, in `server/services/grievance-categories.ts`. Audit entries use the entity type `category`.
- The sidebar has a second group, Administration, with Categories. A nav entry now gives way to a longer one beneath it, so Grievances is not lit on `/grievances/categories` but will still be lit on a detail page.
- Things later slices should know:
  - **Deleting an employee named on a grievance will fail at the database** (`owner_id` and `grievance_people.employee_id` are `ON DELETE RESTRICT`). No grievance can exist yet, so nothing is broken today, but slice 2.2 must add this to `deleteBlocked` in `server/services/employees.ts` so the person gets the usual "archive instead" message and not a 500.
  - `nextGrievanceCode(tx, at?)` in `server/services/grievances.ts` gives `{ code, year, seq }`; call it inside the create transaction. The year is the server's local year. `grievanceCode(year, seq)` in `shared/constants.ts` formats it (four digits, growing past 9999).
  - `GRIEVANCE_STATUSES` (`open`, `in_progress`, `resolved`, `closed`, `voided`) and `GRIEVANCE_PERSON_ROLES` are in `shared/constants.ts`; the database checks both.
  - `grievances.category_id` is `ON DELETE RESTRICT`, and `grievance_people` rows go with their grievance.
  - The list parts (`EditableName`, `AddRow`, `ActiveSwitch`, `DeleteButton`) moved from `lists.tsx` to `web/src/features/common/list-parts.tsx`; the Lists screen behaves as before.
  - `grievanceCategoriesQuery` in `web/src/lib/queries.ts` returns inactive categories too, with a count each. The create form should offer the active ones only.

### Slice 2.2: Create

- `shared/schemas.ts`: `grievanceCreateSchema`. Rules: title, short description, body, date made, owner and category required; at least one Employee Involved and one Management Involved; nobody in both lists; Date Made not in the future.
- `server/services/grievances.ts`: `createGrievance`. Writes the grievance, its people, timeline entry E01 "Grievance recorded" (automatic), and an audit entry, in one transaction.
- `web/src/routes/_app/grievances.new.tsx`: full page. Grievance ID shown as "Assigned when saved". Short inputs for Title and Short Description with character counts; date picker defaulting to today; two multi-select people pickers; single-select Owner; Category; the editor. Leaving with unsaved text asks first. Nothing is saved to browser storage, because these are sensitive and machines may be shared.

Done when: a grievance can be created by either role and reopened with its formatting intact; every validation rule has a test.

**Results (2026-10-12).** 127 tests pass (5 of them new) and the typecheck is clean. Checked on a production build in headless Chrome 155 as an Admin and as a Super Admin: 14 checks, all passing. Firefox was not run. Screenshots are in `qa-shots/slice-2.2/` (not committed).

- **What was built:** `grievanceCreateSchema` and `localToday` in `shared/schemas.ts`; `createGrievance`, `getGrievance` and `peopleOf` in `server/services/grievances.ts`; `POST /api/grievances`; the page at `/grievances/new`, reached from a "New grievance" button on the list page.
- **Decisions and things later slices should know:**
  - `POST` answers 201 with a `GrievanceDetail` (in `shared/types.ts`), the shape slice 2.4's `GET /api/grievances/:code` should return; `getGrievance` already takes `{ code }`.
  - **After saving, the page goes to the list**, because there is no detail page yet. Slice 2.4 points it at the new grievance. "Reopen it with formatting intact" was checked by reading the stored `body_html`, not on a page, for the same reason.
  - An archived employee is refused in either people list and as owner (422 on that field); an inactive category answers 409 `category_inactive`.
  - The warning when the owner is also named on the grievance is a note under the Owner field, not a block. The "owner has no linked account" note is left to slice 4.1, which is where it starts to matter.
  - Leaving the page with anything typed asks first (`useBlocker`, and the browser's own prompt on close or reload). Nothing typed is written to browser storage.
  - `deleteBlocked` in `server/services/employees.ts` now counts grievances, so deleting a named employee gets "archive instead" and not a 500.
  - The E01 "Grievance recorded" entry is not written, as planned; slice 3.1 back-fills it.

### Slice 2.3: Browse

- `GET /api/grievances` with server-side `status`, `owner`, `category`, `from`, `to` and `q` (matches ID, title, short description, body text and people's names). Returns no body HTML, only the 300-character preview.
- `web/src/routes/_app/grievances.index.tsx`: the table in section 3, status tabs (Open, In progress, Resolved, Closed, All; Voided only under All), owner and category filters, date range, search, row expander, empty states.

**Results (2026-10-12).** 132 tests pass (5 of them new) and the typecheck is clean. Checked on a production build in headless Chrome 155 as an Admin: 14 checks, all passing. Firefox was not run. Screenshots are in `qa-shots/slice-2.3/` (not committed).

- **What was built:** `grievanceListQuerySchema`; `listGrievances` in `server/services/grievances.ts` behind `GET /api/grievances`; `grievancesQuery` in `web/src/lib/queries.ts`; the list page; `GrievanceStatusBadge` in `web/src/features/grievances/status.tsx`; a `detail` slot on `DataGrid` for a row of its own beneath a row (the expander).
- **Decisions and things later slices should know:**
  - The answer is `{ rows, counts, owners }` (`GrievanceList` in `shared/types.ts`), not a bare array. `counts` is per status and for all, under the other filters, and feeds the numbers on the tabs. `owners` is everyone who owns a grievance, for the owner filter.
  - **The page opens on the Open tab.** Voided grievances appear under All only. `status=all` is the server's default.
  - `from` and `to` are days, both inclusive, compared with Date Made. Search splits on spaces and every word must be found somewhere: ID, title, short description, body text, or the name of the owner or anyone named.
  - The whole match is returned and paged in the browser, 25 to a page. If the volume ever calls for it, `limit` and `offset` go on the query as in the Audit Log.
  - **The ID and title are not links yet**; slice 2.4 makes them so.
  - The filters live in the address, so a filtered list can be bookmarked or sent. Typing in the search replaces the history entry, as on the Audit Log page.
  - At 1440 wide the table is wider than its panel and scrolls sideways inside it, as other wide grids do. Short Description and Last activity drop out below `xl`, the people columns below `lg`.

### Slice 2.4: Detail

- `GET /api/grievances/:code`.
- `web/src/routes/_app/grievances.$code.index.tsx`: header (ID, title, status, category), a facts panel (Date Made, Owner, Employees Involved, Management Involved, recorded by and when), the formatted body, and a placeholder for the timeline. An archived employee is still shown, marked "archived".

**Results (2026-10-12).** 134 tests pass (2 of them new) and the typecheck is clean. Checked on a production build in headless Chrome 155 as an Admin: 22 checks, all passing, at 1600 and 390 wide. Firefox was not run. Screenshots are in `qa-shots/slice-2.4/` (not committed).

- The ID in the address is matched in any letter case, and an unknown one gets a "No grievance with that ID" page with a way back. Reading a grievance writes nothing to the Grievance Audit Log.
- The header does not carry the workspace name (the question slice 1.4 left open): the rail, or the top bar on a narrow screen, and the back link already say Grievances.
- The short description is shown under the title; the plan did not list it, but it is otherwise only visible in the list.
- In the list both the ID and the title are now links to the detail page, and saving a new grievance lands on it rather than on the list.

## 6. Phase 3: Actions and events

### Slice 3.1: Data and add-entry

Migration `0009_grievance_entries`:

- `grievance_entries`: `id`, `grievance_id` (required, restrict), `seq` (unique per grievance), `kind` (`action`, `event`, `correction`, `system`), `corrects_entry_id` (set only for a correction), `occurred_at`, `recorded_at`, `title`, `short_description`, `body_html`, `body_text`, `documented_by_employee_id` (nullable), `documented_by_user_id` (required), `documented_by_label` (name as it was at the time). No update or delete path exists in the service.

The E01 entry written by slice 2.2 moves into this table; until this slice lands, 2.2 skips it and the migration back-fills it.

- `POST /api/grievances/:code/entries`. Documented By is taken from the session, never from the request.
- `web/src/routes/_app/grievances.$code.entries.new.tsx`: Grievance ID and title shown locked at the top; Type (Action or Event); Occurred at (date and time, defaults to now); Title; Short Description; the editor. Refused with a clear message if the grievance is Closed or Voided.

**Results (2026-10-12).** 141 tests pass (7 of them new) and the typecheck is clean. Checked on a production build in headless Chrome 155 as an Admin: 14 checks, all passing. Firefox was not run. The scratch database was one from before this slice, so the back-fill ran on real rows: all six grievances got their E01. Screenshots are in `qa-shots/slice-3.1/` (not committed).

- **What was built:** migration `0009_grievance_entries` (table, back-fill, triggers); `server/services/grievance-entries.ts` with `appendGrievanceEntry` (used inside another transaction; `createGrievance` writes E01 with it) and `createGrievanceEntry`; `POST /api/grievances/:code/entries`, answering 201 with a `GrievanceEntry`; the page at `/grievances/:code/entries/new`, reached from "Add action or event" in the Timeline panel.
- **Decisions and things later slices should know:**
  - **The table itself is append-only**, by triggers on the same terms as the audit logs: an update, a delete or a replace aborts. The one change let through is the foreign key clearing `documented_by_employee_id` when that employee is deleted. A fourth trigger refuses a correction that points at another grievance's entry, and a check constraint ties `corrects_entry_id` to `kind = 'correction'`.
  - `last_activity_at` moves with every entry already (`appendGrievanceEntry` does it), so slice 3.2 has nothing to add there.
  - Automatic entries (`kind = 'system'`) have an empty short description and body. Slices 4.1 onwards write theirs through `appendGrievanceEntry`.
  - **Details (the body) are optional on an entry**; Title and Short description are required. The plan did not say either way.
  - Occurred at is sent as an instant (ISO, with offset) and may be back-dated without limit, but not in the future (five minutes of clock slack).
  - Documented By is the signed-in account's name as it was at the time (`documented_by_label`), with the account's linked employee, if it has one, in `documented_by_employee_id`. Extra fields in the request are ignored.
  - A Closed or Voided grievance answers 409 `grievance_sealed`; the page hides the button and shows a notice in place of the form.
  - The back-fill skips a grievance whose recording account has been removed, since an entry must name an account. No such grievance exists today: accounts cannot be deleted.
  - There is no way to read entries over the API yet; slice 3.2 adds it.
  - `GrievanceLoadError` in `web/src/features/grievances/load-error.tsx` is the "No grievance with that ID" view, shared by every page under one grievance.

### Slice 3.2: Timeline

**Design first (stops for your sign-off).** The viewer is mocked in the browser against a long, realistic case (20 or more entries of every type, a correction, attachments, a back-dated entry) and you pick a direction before it is built. What is being decided: the card and rail treatment; how the four entry types and automatic entries are told apart without relying on colour alone; date grouping (a marker per day or month so a long case can be scanned); how much of an entry shows in the timeline before opening it (short description only, or expandable to the full body in place); how corrections are tied visually to what they correct; density and the print appearance, since the case file in slice 7.1 reuses this design. The chosen direction is recorded in `DESIGN.md`.

Then built:

- The timeline replaces the placeholder on the detail page, with "Add action/event" above it and a type filter (All, Actions, Events, hide automatic).
- A sticky summary beside it on wide screens (status, owner, entry count, first and latest activity) so the case's state stays in view while reading down.
- `last_activity_at` on the grievance is updated with each entry.
- Reduced-motion and keyboard reading order are checked, and the timeline is a real list for screen readers.

### Slice 3.3: Entry detail and corrections

- `web/src/routes/_app/grievances.$code.entries.$seq.tsx`: every field, full body, previous/next entry links, and back to the grievance.
- "Add correction" on an entry opens the add form with Type fixed to Correction and the original linked. Both entries show the link. The original text is never changed or hidden.

Done when: a test proves no API route can change or remove an entry, and an entry cannot be created without a valid grievance.

## 7. Phase 4: Lifecycle and history

### Slice 4.1: Status and ownership

- Statuses: Open → In progress → Resolved → Closed, and Voided. The owner's account or a Super Admin can move between the first four, including reopening; a note is optional except on Close, where it is required.
- Changing the owner is its own action with an optional note, also for the owner's account or a Super Admin. Handing a grievance to someone else therefore ends the previous owner's ability to change it.
- Everyone else sees these controls disabled with "Only the owner (name) or a Super Admin can do this." The server refuses the request with 403 regardless of what the page shows.
- If the Owner is an employee with no linked account, only Super Admins can change the grievance. The create and reassign forms say so when such an owner is picked.
- Each change writes an automatic timeline entry ("Status: Open → In progress", "Owner: A → B") with the note as its body, and an audit entry.
- **Void** (Super Admin, reason required): the grievance becomes read-only and drops out of the default view. Admin sees the control disabled with the reason, as delete is elsewhere.

### Slice 4.2: Edit with versions

Migration `0010_grievance_versions`:

- `grievance_versions`: `grievance_id`, `version`, a full snapshot of the editable fields and people as they were, `changed_by_user_id`, `changed_at`, `reason`.

- Editing is for the owner's account or a Super Admin (G1a), checked on the server.
- `PATCH /api/grievances/:code` takes the version the editor loaded. If someone else saved in the meantime it is refused with 409 and the page offers to reload, in the style of the existing return-conflict screen.
- Edit page: the create form pre-filled, plus a required "Reason for change". Saving stores the old version, bumps `version`, and writes an automatic timeline entry naming the fields that changed.
- `grievances.$code.versions.tsx`: each earlier version, who changed it, when and why, with the full text of that version.
- Closed and Voided grievances cannot be edited.

### Slice 4.3: Guards on employees

- `server/services/employees.ts`: an employee named anywhere on a grievance (involved, management, owner, documented by) cannot be deleted; the reason shown says "Named on a grievance" without giving its ID or title. An employee who owns a grievance that is not Closed or Voided cannot be archived until it is reassigned.
- Tests for both, and for the existing employee rules still passing.

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
- Browser check on a production build: create, edit, add entries of each type, correct one, change status, void, upload and download, both exports opened, both audit logs inspected, keyboard-only pass, and a session expiring mid-edit without losing the text.

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
