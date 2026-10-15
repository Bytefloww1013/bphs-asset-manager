# Maintenance requests — implementation plan

Status: **being built (2026-10-15)**. Your answers are folded in; the decisions are in §12. Progress is ticked off in §11.

## 1. What it does

1. A staff member submits the existing Zoho form, *Maintenance Work Order Request*.
2. Zoho POSTs the entry as JSON to `https://bphs-connect.com/api/webhooks/maintenance`.
3. BPHS-Connect checks a shared secret in a header and stores the request as **Not Started**. It also adds a "Received from Zoho Forms" line to the request's timeline.
4. A **Maintenance** workspace, which only Super Admins can open, lists every request. A Super Admin can open one to:
   - choose the employee it is dispatched to, which makes it **Dispatched**;
   - change its status;
   - add notes over time.

   Each change also writes a line to the timeline, so the timeline is the request's full history.
5. A Super Admin can also enter a request by hand (for a phone call, or one the webhook missed) and can delete junk or test requests. Requests that will not be done are normally marked **Rejected** instead of deleted.

This is deliberately lighter than Grievances. It has no rich text, owners, categories, attachments, voiding or separate audit page.

## 2. Zoho setup — how to fill in the Webhooks Configuration screen

In Zoho Forms, open *Maintenance Work Order Request* → **Integrations → Webhooks** and fill in the screen from your screenshot:

| Section of the screen | What to enter |
|---|---|
| Webhook URL | `https://bphs-connect.com/api/webhooks/maintenance` |
| HTTP method | `POST` |
| Payload Content Type | **`application/json`** |
| Authorization Type | `General` (as it is now) |
| Payload → Form Fields | Each field below, with its **Parameter Name** typed exactly as shown. Use **+** to add the three new rows. |
| URL Parameters | Leave empty |
| Custom Headers | Name `X-Webhook-Secret`. Value: the secret (see below) |

Form-field rows:

| Form field (left column) | Parameter Name (type exactly) | In the app |
|---|---|---|
| Name – First Name | `firstName` | Requested by |
| Name – Last Name | `lastName` | Requested by |
| Email | `email` | Email |
| Program Selection | `program` | Program, as Zoho's text, e.g. `0003-Yough` |
| Location/Room of Request | `location` | Location |
| Added Time | `addedTime` | Submitted |
| Describe the Request in Detail | `description` | Description |
| *new:* Urgent? | `urgent` | Urgent |
| *new:* Date | `requestDate` | Date |
| *new:* Date Maintenance Issue was Noticed | `noticedDate` | Noticed |

Parameter names are case-sensitive. Fields that are left out (Upload Image(s), Verify, Signature, CAPTCHA) are not sent and are not needed.

**The secret.** The same value goes in two places: the Zoho custom header, and `MAINTENANCE_WEBHOOK_SECRET` on the server. Generate it once with:

```bash
openssl rand -hex 32
```

**Why JSON and not the other two types.** Zoho also offers `application/x-www-form-urlencoded` and `multipart/form-data`. The app's cross-site-request check refuses both of those from Zoho, because Zoho sends no `Origin` header. JSON passes that check, and the only reason to use multipart would be images, which are not needed.

**After saving,** submit one test entry and check that it appears under Maintenance. That test also confirms the exact JSON Zoho sends, which this plan assumes but has not seen. Then delete the test request.

References: [Zoho webhook configuration](https://help.zoho.com/portal/en/kb/forms/integrations/webhooks/articles/webhook-configuration), [Zoho payload formats per content type](https://help.zoho.com/portal/en/kb/forms/integrations/webhooks/articles/response-format-for-content-type).

## 3. The webhook endpoint

`POST /api/webhooks/maintenance` is mounted on the main app **before** the signed-in `/api` sub-app, so it needs no session.

- **Secret.**
  - `X-Webhook-Secret` is compared with `MAINTENANCE_WEBHOOK_SECRET` in constant time, by comparing the SHA-256 digests of both with `timingSafeEqual`.
  - A missing or wrong secret gets **401**.
  - The secret travels in a header, so it never appears in Nginx access logs.
- **Off unless configured.**
  - If `MAINTENANCE_WEBHOOK_SECRET` is unset, the endpoint answers **404**.
  - If it is set but shorter than 32 characters, the server refuses to start. This matches how `readConfig` rejects other bad values.
- **Body limit.** The existing 4 MB limit for `/api/*` applies, which is ample for text fields.
- **Validation is lenient on purpose.** Zoho does not retry, so a refused request is a lost one.
  - Only `description` is required.
  - Every other field may be missing or empty.
  - Values are trimmed. A value that is not a string is ignored.
  - Unknown keys are ignored, so adding fields in Zoho later breaks nothing.
  - Length caps sit well above anything the form produces: names 100, email 254, program 100, location 200, dates and urgent 100, description 50,000.
  - On a 400, the server logs the **keys** it received, never their values, so a mapping mistake can be diagnosed.
- **Duplicates.** A unique index on (`email`, `zoho_added_time`) catches the same entry sent twice, for example by a re-send from Zoho. A duplicate answers 200 with the existing request's id and does not create a second row. Requests entered by hand have no Added Time, so they are never treated as duplicates.
- **Responses:**
  - `201 { id }` — created.
  - `200 { id, duplicate: true }` — already received.
  - `400` — no description, or the body is not JSON.
  - `401` — bad or missing secret.
  - `404` — the webhook is not configured.

Everything from Zoho is stored and shown as **plain text**. Multi-line text is rendered with `white-space: pre-wrap` and never as HTML.

## 4. Data model (migration `0013_maintenance`)

This adds two new tables and changes no existing table. To roll back, drop the two tables.

**`maintenance_requests`**

| Column | Type | Notes |
|---|---|---|
| `id` | integer pk | Shown as `MR-0042` by a `maintenanceCode(id)` helper. The code is not stored. |
| `first_name` | text not null | `''` when Zoho sent none |
| `last_name` | text null | |
| `email` | text not null | `''` when none (possible for a phoned-in request) |
| `program` | text not null | Zoho's text as-is |
| `location` | text not null | |
| `description` | text not null | |
| `urgent` | text null | As Zoho sends it ("No", or the text typed for "Other"). Hand entry stores "No" or "Yes". |
| `request_date` | text null | The form's Date field, as Zoho formats it |
| `noticed_date` | text null | As Zoho formats it |
| `zoho_added_time` | text null | Zoho's Added Time, as Zoho formats it; null for hand entry |
| `received_at` | timestamp_ms not null | Server time; used for sorting |
| `status` | text not null default `'not_started'` | Check constraint over the five values |
| `assigned_employee_id` | integer null → `employees.id` | `on delete restrict` |

Indexes and checks:
- `uq_maintenance_dedupe` on (`email`, `zoho_added_time`).
- `ck_maintenance_dispatch` holds the dispatch rule from §5 in the database itself:
  - `status = 'dispatched'` ⇒ an employee is set;
  - `status = 'not_started'` ⇒ no employee is set.

**`maintenance_notes`** (the append-only timeline)

| Column | Type | Notes |
|---|---|---|
| `id` | integer pk | |
| `request_id` | integer not null → `maintenance_requests.id` | `on delete cascade` |
| `kind` | text not null | `'note'` or `'system'` (check constraint) |
| `body` | text not null | Plain text, at most 5,000 characters |
| `created_by_user_id` | integer null → `users.id` | `on delete set null`; null for webhook lines |
| `created_by_label` | text not null | The writer's name at the time, or `Zoho Forms` |
| `created_at` | timestamp_ms not null | |

**Constants** (`shared/constants.ts`):
- `MAINTENANCE_STATUSES = ['not_started', 'dispatched', 'on_hold', 'rejected', 'finished']`, with labels Not Started, Dispatched, On Hold, Rejected and Finished.
- `MAINTENANCE_OPEN = ['not_started', 'dispatched', 'on_hold']`.

## 5. Dispatch and status rules

A request is **Not Started** until it is dispatched, and **Dispatched** means an employee has it.

| Action | Result |
|---|---|
| New request (webhook or by hand) | Not Started, with nobody assigned |
| Choose an employee while it is Not Started | **Dispatched** to that employee. One timeline line: "Dispatched to Jane Doe". |
| Choose a different employee while it is Dispatched, On Hold, Rejected or Finished | The employee changes and the status stays. Line: "Dispatch changed: Jane Doe → John Roe". |
| Clear the employee while it is Dispatched | Back to **Not Started**. Line: "Dispatch to Jane Doe cleared". |
| Clear the employee in any other status | The employee is cleared and the status stays. |
| Set status to Dispatched with nobody assigned | Refused: "Choose who it is dispatched to." The page only offers Dispatched once someone is chosen. |
| Set status to Not Started | Also clears the employee, in the same timeline line |
| Set On Hold, Rejected or Finished | Allowed from any status. The employee is kept. |
| Set the status it already has | Refused (409) |

Only active employees can be chosen. Anyone in the employee directory can be chosen, not only people with an account.

## 6. API

All routes are signed in and require the **Maintenance** workspace, which only Super Admins have.

| Route | Does |
|---|---|
| `GET /api/maintenance` | All requests, for the table, with the assignee's name and when the last note was added |
| `POST /api/maintenance` | Enter a request by hand. Required: first name, location and description. Email is optional, but must be a valid address when given. |
| `GET /api/maintenance/:id` | One request and its timeline, oldest first |
| `POST /api/maintenance/:id/dispatch` `{ employeeId \| null }` | Applies §5 |
| `POST /api/maintenance/:id/status` `{ status }` | Applies §5 |
| `POST /api/maintenance/:id/notes` `{ body }` | Appends a note. An empty note is refused. |
| `DELETE /api/maintenance/:id` | Deletes the request and its timeline, and writes one line to the main Audit log, e.g. `delete maintenance_request MR-0042 · Jane Doe · Room 12`. Also checks `record.delete`. |

New files:
- `server/routes/webhooks.ts`
- `server/routes/maintenance.ts`
- `server/services/maintenance.ts`

The webhook and hand entry share one `createMaintenanceRequest`. The code follows `grievances.ts` and `programs.ts`: zod schemas in `shared/schemas.ts`, thin routes, and errors from `server/lib/errors.ts`.

The employee picker reads `GET /api/employees`, which already exists.

**Employee deletion.** `deleteBlocked` in `server/services/employees.ts` refuses to delete anyone who is the current assignee of a maintenance request ("Dispatched on a maintenance request. Archive instead."). Archiving still works: an archived person stays named on their requests but is no longer offered in the picker.

## 7. Workspace and access

| File | Change |
|---|---|
| `shared/constants.ts` | Add `'maintenance'` to `WORKSPACES`, labelled **Maintenance**. Add the status constants. |
| `shared/permissions.ts` | `super_admin` gains `maintenance` in `WORKSPACE_ACCESS`. No new role, and no other role changes. |
| `server/app.ts` | `workspaceOfPath` maps `/api/maintenance` to `'maintenance'`. Mount `/api/webhooks` before `/api`, and `/api/maintenance` inside it. |
| `server/config.ts` | `maintenanceWebhookSecret`: optional, but at least 32 characters when set |
| `web/src/lib/workspace.ts` | `workspaceOf` and `workspaceToReopen` know `/maintenance` |
| `web/src/lib/session.ts` | `requireSession` sends someone who cannot use a workspace to the **first workspace they can use**. Today it flips between assets and grievances. |
| `web/src/routes/_app.tsx` | Reopening the last-used workspace works for all three |
| `web/src/components/shell/app-shell.tsx` | Maintenance gets its own sidebar with one item, **Requests**. A third `WORKSPACES` entry is added. The switcher shows the workspaces the user can use, with one column each: three for a Super Admin, two for an Admin. |

## 8. Pages

**`/maintenance` — the Requests list** (`web/src/routes/_app/maintenance.index.tsx`)

It reuses the Grievances list pieces: `PageHeader`, `FilterTabs`, `SearchInput` and `DataGrid`.

- **New request** button in the header.
- **Tabs:**
  - **Open** (default): Not Started, Dispatched and On Hold;
  - **Finished**;
  - **Rejected**;
  - **All**.
- **Columns:**
  - Request (`MR-0042`);
  - Received;
  - Urgent: a badge when the value is anything other than empty or "No";
  - Requested by;
  - Program;
  - Location;
  - Description, cut to one line;
  - Status badge;
  - Dispatched to.
- **Search** covers name, email, location, description, program and code.
- Clicking a row opens the request.

**`/maintenance/new` — enter a request by hand**

- Fields:
  - first and last name;
  - email;
  - program: a text field that suggests the programs already seen;
  - location;
  - description;
  - urgent: No or Yes;
  - date noticed.
- Saving opens the new request. Its first timeline line reads "Entered by Jane Doe".

**`/maintenance/$id` — one request** (`web/src/routes/_app/maintenance.$id.tsx`)

- **Header:** the code, the status badge, the Urgent badge, and a **Delete** button (danger style) that asks for confirmation.
- **Facts:**
  - requested by;
  - email (as a `mailto:` link);
  - program;
  - location;
  - date;
  - noticed;
  - submitted (Zoho's Added Time);
  - received.
- **Description** in full, as plain text.
- **Dispatched to:** the existing employee `Combobox` (active employees), with a clear button. It saves on change and shows a toast.
- **Status:** a `Select` that saves on change. Dispatched is offered only when someone is assigned.
- **Timeline:** system lines and notes, oldest first, each with who wrote it and when.
- **Add note:** a textarea and an **Add note** button.

The status badge lives in `web/src/features/maintenance/status.tsx`, with these tones:

| Status | Tone |
|---|---|
| Not Started | neutral |
| Dispatched | accent |
| On Hold | warn |
| Rejected | bad |
| Finished | ok |

## 9. Tests

**New `server/tests/maintenance.test.ts`:**

- **Webhook:**
  - 404 when no secret is configured;
  - 401 when the secret is missing or wrong;
  - 201 creates a Not Started request, with all ten fields and a "Received from Zoho Forms" line;
  - a duplicate answers 200 with the same id and no new row;
  - 400 when there is no description;
  - unknown keys and non-string values are ignored;
  - a form-encoded POST is refused, which pins the JSON requirement.
- **Hand entry:** it is created, and missing required fields are refused.
- **Dispatch and status:** every row of the §5 table, including the database check that rejects Dispatched with nobody assigned.
- **Notes:** a note is appended; an empty note is refused.
- **Delete:**
  - it removes the request and its timeline;
  - it writes an audit line;
  - it is refused for anyone but a Super Admin.
- **Employees:** deleting the employee on a dispatched request is blocked.

**Additions elsewhere:**
- `server/tests/workspaces.test.ts`: Super Admin gets 200 on `/api/maintenance`; Admin, Asset Admin and Grievance Admin get 403.
- Config: a short secret fails at startup.
- **Visual check** in headless Chromium, following the repo's Playwright routine:
  - the list;
  - the new-request form;
  - the detail page;
  - the three-way switcher;
  - phone width.

## 10. Docs and deploy

- **README.md**: add `MAINTENANCE_WEBHOOK_SECRET` to the environment table. "The app makes no outbound calls" still holds, because this is inbound only.
- **DEPLOY-GUIDE.md**:
  - add the variable to `/etc/bphs-connect/compose.yml`;
  - include the Zoho setup from §2;
  - include the test submission.
- **RUNBOOK.md**:
  - **A request is missing.** Zoho keeps every entry under the form's *Entries*. Enter it by hand under Maintenance → New request.
  - **Rotating the secret.** Change the server setting and the Zoho header together, then send a test entry.

## 11. Phases

Each item is ticked when it is done, and each has its own commit on the `maintenance-workspace` branch.

1. **Server.**
   - [x] Constants, schema and migration, config
   - [ ] Workspace access
   - [ ] Webhook, service and routes
   - [ ] The employee-delete rule
   - [ ] Tests
2. **Web.**
   - [ ] Workspace plumbing (switcher, guard, nav)
   - [ ] List, new-request and detail pages
   - [ ] Visual check
3. **Go live.**
   - [ ] Update the docs.
   - [ ] *(you)* Set the secret on the VPS and deploy.
   - [ ] *(you)* Configure the Zoho webhook as in §2.
   - [ ] *(you)* Send one test submission, check it, then delete it.

## 12. Decisions from review

1. **Access:** Super Admins only. No new role, and Admin keeps its "both workspaces" label.
2. **Who dispatches:** Super Admins, because only they can open Maintenance. *Assumed:* a request can be dispatched to any active employee in the directory, per your answer to 3. Tell me if you meant it can only be dispatched to people who are Super Admins.
3. **Dispatching** sets the status to Dispatched; the full rules are in §5.
4. **Program:** Zoho's text, kept as-is.
5. **Extra fields:** Urgent?, Date and Date Maintenance Issue was Noticed are captured. Images are not needed.
6. **Hand entry:** yes, via a **New request** button. Zoho remains the main way requests arrive.
7. **Delete:** Super Admins can delete, with a confirmation step and an audit-log line. Normally a request is marked Rejected instead.
8. **Initial status:** Not Started until it is dispatched. The Open tab is Not Started, Dispatched and On Hold.
9. **Content type:** `application/json` (§2 says why).

## 13. Risks

- **Zoho does not retry.** A request submitted while the app is down or restarting never arrives. It is still safe in Zoho's Entries, and the runbook says to enter it by hand.
- **The payload shape has not been seen yet.** The parameter names and Zoho's date formats are assumptions until the first test submission. Lenient parsing and logging only the keys keep that cheap to fix.
- **Secret exposure.** Anyone who can edit the Zoho form's integrations can read the secret. Anyone who has it can create requests, but cannot read or change anything.
- **Personal data.** Staff names and emails are stored in BPHS-Connect as well as in Zoho. Backups cover them like everything else, and text-only rows add little to backup size.
