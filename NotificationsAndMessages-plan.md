# Notifications and messages — plan

> **Depends on [MySpace-plan.md](MySpace-plan.md).** The Inbox, notification settings and notices are pages in My Space, so that plan is built first.

Status: **built (2026-10-19).** All five phases are done; the end-to-end check is in [design-qa.md](design-qa.md).

## How this plan is worked

- Each phase is made of slices. Tick a slice's box when it is done. Commit when the whole phase is done, ticks included: **one commit per phase**.
- **Don't push** unless the user says to.
- Each slice ends with `bun run typecheck` and `bun run test` passing. Slices that change screens are also checked in the browser.
- Deploying to the VPS is separate. It happens only when you ask, with [DEPLOY-GUIDE.md step 13](DEPLOY-GUIDE.md#13-deploy-later-updates), which takes a backup first. This plan adds a migration.

## 1. What it does

- Every account gets **notifications** about things that involve it. They show as a **bell** with a red count of unread notifications, in the sidebar header and in the mobile top bar.
- Clicking the bell opens a **popover** with the latest notifications and a **See all** link to the **Inbox** in My Space.
- In the Inbox, a notification can be marked read or unread, archived, or used to **mute** its source for a while.
- **Super Admins** can send **notices**: short announcements to every active account or to accounts they pick.
- **Nothing is ever sent about Grievances or Administrative Reviews.** Both are confidential, and a notification would leak that a case exists.

## 2. Decisions made

| Question | Decision |
|---|---|
| "Messages" in v1 | System notifications plus Super Admin notices. No replies and no messages between people. The **Mailbox** stays a placeholder in My Space. |
| How they are opened | A bell popover (latest few) **and** an Inbox page in My Space. |
| Default audience for "team" notifications | Accounts with **Edit or Full** access in the section, **plus Super Admins**. This is the default for any future notification unless you decide otherwise. |
| Your own actions | Never notify you. |
| Deactivated accounts | Get nothing. |
| What a notification can do | Mark read or unread, mark all read, archive (and unarchive). |
| How fresh | The unread count is fetched every **30 seconds** and whenever the tab regains focus. Nothing is pushed live. |
| Mute | From any notification: **Mute this item** (e.g. just MR-00042 or asset BP-0113) or **Mute this kind** (e.g. all overdue reminders), for **24 hours, 7 days, 1 month or Until I change it**. A confirmation box explains exactly what happens. |
| While muted | The notification still arrives in the Inbox, unread, with a muted-bell icon. It does **not** add to the red count and is not highlighted in the popover. |
| Never mutable | Account and security events, and Super Admin notices. |
| Who sends notices | **Super Admins only.** The rule is one function (`canSendNotices`), so it can be widened later by changing one line and its test. |
| Notice audience | Every active account, or accounts picked from a list. |
| Notice body | Plain text with line breaks, up to 2,000 characters. Rich text is not needed for short announcements, and plain text reads cleanly in the popover. |
| Retention | Notifications older than **1 year** are deleted, whether read or not, by the same timer that clears expired sessions. Expired mutes are cleared too. |
| Email | Not sent. In-app only. |
| Imports | Rows created by **Import / Export** do not notify anyone. A bulk load would flood the inboxes. |
| Custom triggers, @mentions | Future TODOs in [TODO.md](TODO.md). This plan keeps them possible without schema rework (§3). |

## 3. Design

### Tables (migration `0017_notifications`)

- **`notifications`**: one row per recipient.
  - `id`, `user_id` (→ users, cascade), `kind` (text, e.g. `asset_issued`), `source_key` (text, e.g. `asset:113` or `maintenance:42`, which is what "Mute this item" matches), `title`, `body` (nullable), `link` (an in-app path), `created_at`, `read_at`, `archived_at`, `muted` (whether a mute applied when it arrived).
  - Indexes: `(user_id, archived_at, created_at)`, plus a partial index for counting unread and unmuted rows.
- **`notification_mutes`**: `id`, `user_id`, `kind`, `source_key` (null means the whole kind), `until` (null means "until I change it"), `created_at`.
- **`notices`**: `id`, `title`, `body`, `audience` (`all` or `picked`), `created_by_user_id`, `created_at`. Each recipient gets a `notifications` row with `kind = 'notice'` and `source_key = notice:<id>`, so the read counts come from those rows.

`kind` is open text checked against a list in `shared/`, so a new kind needs no migration. A future custom trigger is "when X happens, call `notify()` with these recipients", so it will need a rules table and nothing in this one changes.

### One writer: `notify()`

`server/services/notifications.ts` exports `notify(tx, actor, { recipients, kind, sourceKey, title, body?, link })`. It runs **inside the transaction of the change that caused it**, so a notification never exists for a change that rolled back. It:

1. resolves the recipients to active user IDs;
2. drops the actor and any duplicates;
3. sets `muted` for each recipient who has a live mute that matches (except for unmutable kinds);
4. inserts the rows.

Recipient helpers:

- `accountOf(tx, employeeId)`: the active account linked to an employee. `uq_users_employee` means there is at most one. An employee without an account gets nothing.
- `sectionTeam(tx, section)`: active accounts with Edit or Full in that section, plus Super Admins.

### Safety

- **Every `/api/me/*` route only ever touches the caller's own rows.** Another user's ID returns 404. These routes need a session but no section access.
- **Titles name the thing, never sensitive details.** For example "BP-0113 was issued to you", or "MR-00042 was put on hold by Dana Ruiz".
- **A link must be an in-app path.** It is checked when written (it must start with a single `/`) and again when drawn, with the same rule as `returnPath()`, so a notification cannot send anyone off-site.
- Sending a notice writes a line to the audit log. Reading, archiving and muting do not.

### Events in this plan

| Kind | When | Who | Mutable |
|---|---|---|---|
| `asset_issued` | A physical asset is issued, or created already issued, to your linked employee. | You | Yes |
| `digital_issued` | A digital asset is issued to your linked employee. | You | Yes |
| `asset_returned_poor` | An asset is returned with a rating in the **attention** band (`ratingBand()`, below `RATING_ATTENTION_BELOW`). A bulk return sends one notification listing the tags. | Assets team (Edit/Full + Super Admins) | Yes |
| `maintenance_dispatched` | A request is dispatched or reassigned **to** you. | You | Yes |
| `maintenance_changed` | A request assigned to you is reassigned away from you, changes status, or gets a note, by someone else. | You | Yes |
| `asset_overdue` | An asset issued to you passes `OVERDUE_DAYS`. Sent **once** per assignment. | You | Yes |
| `account_password_reset` | A Super Admin resets your password. | You | **No** |
| `account_access_changed` | Your access levels or Super Admin status change. | You | **No** |
| `account_unlocked` | Your locked account is unlocked. | You | **No** |
| `account_employee_linked` | Your account is linked to a different employee. | You | **No** |
| `notice` | A Super Admin sends a notice. | Everyone, or the people picked | **No** |

## 4. Phases and slices

### Phase 1 — Data and API

- [x] **1.1 Tables and kinds.**
  - Add the three tables to `server/db/schema.ts` and generate `0017_notifications` with `bun run db:generate`.
  - Add `NOTIFICATION_KINDS` with labels and an `unmutable` flag, and the row types, to `shared/`.
  - Tests: the migration applies to a copy of the current schema.
- [x] **1.2 `notify()` and the recipient helpers.**
  - Tests: the actor is skipped; inactive accounts and employees without accounts are skipped; duplicates are dropped; item and kind mutes set `muted`, but not for unmutable kinds; expired mutes are ignored; a rolled-back transaction leaves no notification; a link that is not an in-app path is refused.
- [x] **1.3 Inbox API.**
  - `GET /api/me/notifications?view=unread|all|archived` (newest first, paged with a cursor).
  - `GET /api/me/notifications/count` (unread and not muted).
  - `POST …/:id/read`, `…/:id/unread`, `…/read-all`, `…/:id/archive`, `…/:id/unarchive`.
  - Tests: only your own rows are visible, another user's ID is 404, the count leaves out muted rows, and read-all leaves archived rows alone.
- [x] **1.4 Mutes API.**
  - `POST /api/me/mutes` with `{ kind, sourceKey?, duration: '24h' | '7d' | '1m' | 'forever' }`.
  - `GET /api/me/mutes` (active only) and `DELETE /api/me/mutes/:id`.
  - Tests: unmutable kinds are refused, durations end where they should, and muting the same thing again replaces the old mute rather than stacking.
- [x] **1.5 Retention.**
  - `purgeNotifications(db, now)` deletes notifications over a year old and expired mutes. It runs on the existing 6-hourly timer in `server/index.ts`.
  - Tests: the boundaries at exactly one year.

### Phase 2 — Bell and Inbox

- [x] **2.1 The bell.**
  - Add the bell to the sidebar header (wide screens) and the mobile top bar. The count query refetches every 30 seconds and on focus.
  - Badge: red background, white text, `99+` past 99, hidden at 0. Label: "Notifications, 3 unread".
  - Add sample notifications to `bun run db:seed` (dev only) so the screens have something to show before the events exist.
- [x] **2.2 The popover.**
  - Shows the latest 8. Unread rows are bold with a dot; muted rows show the muted-bell icon.
  - Clicking a row marks it read and follows its link. Also has **Mark all read** and **See all** (→ `/me/inbox`).
  - Fully usable from the keyboard (Radix popover).
- [x] **2.3 Inbox page.**
  - `/me/inbox` in My Space, with **Unread / All / Archived** tabs.
  - Each row has a menu: mark read or unread, archive or unarchive, **Mute this item…**, **Mute this kind…**.
  - Add **Inbox** as the first entry in the My Space sidebar, with the same count.
- [x] **2.4 Mute confirmation.**
  - The dialog names what is muted and offers the four durations.
  - It says in plain words: *"New notifications from this source will still arrive in your Inbox, but they won't add to the red count on the bell or appear as new anywhere else. You can unmute it in Notification settings."*
  - Unmutable kinds do not offer Mute at all.
- [x] **2.5 Notification settings page.**
  - `/me/notifications`: active mutes with what each mutes and when it ends ("Until you change it"), each with **Unmute**.
  - Also lists which kinds can never be muted, and why.

### Phase 3 — The events

- [x] **3.1 Assets issued to you.**
  - Call `notify()` from `issueInTx` in `assignments.ts` (which covers asset creation with a holder, through `assets.ts`) and from `issueInTx` in `digital-assets.ts`.
  - Skip it for imports.
  - Tests for each path, plus "issued to a program" and "employee without an account" (both get no notification).
- [x] **3.2 Returned in poor condition.**
  - From `returnInTx` when the rating is in the attention band. `returnMany` gathers its returns into one notification per bulk return.
  - Tests: who receives it (the Edit/Full team plus Super Admins, not the actor and not Read-only accounts) and that a bulk return sends one.
- [x] **3.3 Maintenance.**
  - Call `notify()` from `dispatchMaintenanceRequest` (to the new assignee, and to the previous one as "changed"), `changeMaintenanceStatus` and `addMaintenanceNote`.
  - Tests: no notification when you act on your own request, and none for an unassigned request.
- [x] **3.4 Account and security events.**
  - Call `notify()` from `resetPassword`, `updateUser` (access, Super Admin and employee link) and `clearLock` in `users.ts`.
  - Tests: each event fires, none can be muted, and the admin CLI's reset (`bun run admin reset-password`) also notifies, with the actor shown as the CLI.
- [x] **3.5 Overdue reminder.**
  - A sweep on the same timer finds open assignments past `OVERDUE_DAYS` whose employee has an account and that have no `asset_overdue` notification for `assignment:<id>` yet.
  - Tests: it is sent once and only once, and it is not sent for a returned asset or for a program holder.

### Phase 4 — Super Admin notices

- [x] **4.1 Notices API.**
  - `POST /api/notices` (Super Admin, via `canSendNotices`) with `{ title, body, audience: 'all' | { userIds } }`.
  - `GET /api/notices` (the ones sent, with read counts) and `GET /api/me/notices/:id` (a recipient reading one).
  - Writes an audit line. Tests: a non-Super Admin is refused, a picked audience gets only those accounts, and deactivated accounts are skipped.
- [x] **4.2 Reading a notice.**
  - Opening a notice notification shows its full text on `/me/inbox/:id`, which marks it read.
- [x] **4.3 Notices page.**
  - `/me/notices` (only in a Super Admin's My Space sidebar): a **New notice** sheet (title, body, everyone or picked accounts) and a list of sent notices showing "*n* of *m* read".

### Phase 5 — Docs and end-to-end check

- [x] **5.1 Docs.**
  - [PRODUCT.md](PRODUCT.md) and [README.md](README.md): notifications, mutes, notices, retention.
  - [DESIGN.md](DESIGN.md): the bell, the badge, the popover and the muted icon.
  - [RUNBOOK.md](RUNBOOK.md): the new migration and the purge timer.
  - [SECURITYREVIEW.md](SECURITYREVIEW.md): a short section on own-rows-only, in-app links, and Grievances and Reviews being excluded.
- [x] **5.2 End-to-end browser check.**
  - With two accounts side by side: issue an asset, return one in poor condition, dispatch and update a maintenance request, reset a password, send a notice, mute an item and a kind, and check the count, popover, Inbox and settings at wide and narrow widths.
  - Record the results in [design-qa.md](design-qa.md).

## 5. Not in this plan

These are Future TODOs in [TODO.md](TODO.md):

- @mentions
- custom notification triggers
- the Mailbox (messages between people)
- the personal dashboard
- how to show many workspaces cleanly
