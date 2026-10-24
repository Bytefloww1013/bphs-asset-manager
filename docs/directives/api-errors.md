---
description: How server code raises and reports errors to API clients
scope: root
covers: [errors, HttpError, api, validation, status-codes, bulk, server]
---

# API errors

- Raise errors as `HttpError` (`server/lib/errors.ts`, imported as `#kernel/lib/errors.ts`). Prefer its helpers: `notFound(what)`, `conflict(code, message)`, `forbidden(message?)`, `invalid(message, details?)`.
- `code` is a stable snake_case identifier the web reads (`already_returned`, `attachment_withdrawn`); `message` is one user-facing sentence ending in a full stop, naming the record by its name (`${request.name} has already been returned.`).
- An error about one field passes `{ field: '<name>' }` as details; `HttpError` copies the message into `details.fields` so the form shows it beside that field.
- Don't catch database constraint errors to rewrap them. `describeError` turns an unforeseen constraint into a 409 and anything else into a 500 with a generic message, and the caller logs it.
- A bulk request answers per row with `rowFailure`; each row is its own transaction, so one bad row never hides the others.
- Never send stack traces, SQL, table names or internal ids in a message.
- Status codes: 401 not signed in, 403 not allowed, 404 not found, 409 conflicts with existing records, 410 withdrawn, 422 validation failed.
