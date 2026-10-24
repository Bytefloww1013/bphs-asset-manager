# `maintenance` (feature)

Maintenance requests: each one comes from the Zoho form's webhook or is entered by hand, is dispatched to an employee, and is worked through to Finished or Rejected. Each request has a timeline of notes, plus the lines the app writes when the request changes.

## Tables

- `maintenance_requests` (`server/schema.ts`): what Zoho sent, kept as the text it sent (name, email, program, location, description, urgent, its dates and Added Time), `received_at`, `status` and the employee it is dispatched to. A Zoho entry is unique by email and Added Time. Two checks hold: Dispatched means someone is dispatched, and Not Started means nobody is.
- `maintenance_notes`: the timeline. Each line is a `note` or a `system` line, with the writer's name as it was then ("Zoho Forms" for the webhook's). A request's notes go when it is deleted.

## Resources and rules

- `maintenance` (a workspace, second on the rail). Read sees every request and its timeline. Edit enters requests by hand, dispatches them, changes their status and adds notes. Full also deletes a request.
- Dispatching a Not Started request makes it Dispatched, and clearing the employee from a Dispatched one puts it back to Not Started. Setting it to Not Started clears the employee. The other statuses keep the employee.
- Only an active employee can be dispatched (`requireActiveEmployees`).
- Delete is for junk and tests, and it is audited (`maintenance_request`). A request that will not be done is set to Rejected instead.

## Webhook

- `POST /api/webhooks/maintenance` (`server/webhook.ts`, `base: '/maintenance'`). It is public: Zoho signs each call with the `X-Webhook-Secret` header, not a session, so it is answered before the sign-in check. It is off (404) unless `MAINTENANCE_WEBHOOK_SECRET` is set, and the kernel keeps that setting (`server/config.ts`).
- It reads Zoho's fields leniently. Text that is too long is cut, not refused, because Zoho does not retry. An entry with no description is refused (400), and the log gets only its keys. An entry Zoho sends twice returns the request it already made.

## Hooks

- Provides `employee.references` (`maintenanceEmployeeReferences`): an employee who was ever dispatched on a request can't be deleted.
- Uses `notifications` and `audit` (through their public APIs) and `employees` (`employeeRef`, `requireEmployee`, `requireActiveEmployees`).

## Notifications

- `maintenance_dispatched` goes to the account linked to the employee who is dispatched. `maintenance_changed` goes to the same account when the request is reassigned away from them or cleared, its status changes, or a note is added. Both are employee kinds, so they are forgotten when the account's employee link changes. Someone acting on a request dispatched to themselves is told nothing.

## Public API

- `shared/index.ts`: the statuses, `MAINTENANCE_OPEN`, `maintenanceCode`, `maintenanceStatusLabel`, and the row and detail types.
- `server/index.ts`: the two tables.
- `web/index.ts`: `maintenanceQuery`, `maintenanceRequestQuery`.

## Pages

- `/maintenance` (Requests: the list, with tabs by status), `/maintenance/new` (entering a request by hand) and `/maintenance/$id` (the request, its timeline, dispatch and status), all in `web/routes/`.

## Gotchas

- The dates Zoho writes stay as text. The detail page shows them the US way with `formatUsDate` (`shared/dates.ts`), which stays in the kernel because Reviews uses it too.
- `employee.references` asks the modules in registry order, and the first blocker is the one given. This module sits before `reviews` in `FEATURES`, so an employee blocked by both is told about the maintenance request first, as before the split (`server/tests/api.test.ts` pins it).
