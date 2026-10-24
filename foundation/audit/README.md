# `audit` (foundation)

The central audit log: who changed what, and when. Every module that is not confidential records its changes through `writeAudit()`; this module owns the table, the Audit Log page and the log component the Grievance and Review Audit Logs draw too.

## Tables

- `audit_log` (`server/schema.ts`): one row per successful change and per sign-in, with when, the actor's email (and account id, cleared when the account is deleted), the action, the entity type and id, and details. Append-only: database triggers refuse any update or delete, and an entry can't be renumbered or replaced.

## Resources and rules

- No resource of its own. Reading the log (`/api/audit`, `/api/audit.csv`) takes Assets Read. Nobody, Super Admins included, can edit or remove an entry.
- `writeAudit()` runs inside the transaction of the change it records, so a change that rolls back leaves no entry. It refuses an entity type no module declares.
- The search's from and to are instants (`auditQuerySchema`); the page turns the viewer's days into them (`auditRange` in `web/queries.ts`).

## Entity types

- Each module declares its entity types in its manifest (`auditEntityTypes`). `auditEntityTypes()` (`shared/registry.ts`) is them all, and `AuditEntityType`, their union, is what `writeAudit()` takes. A type is declared once.
- This module declares `user` (the kernel's accounts and sign-ins): the kernel has no manifest of its own.
- Grievances and Administrative Reviews keep their own audit logs, apart from this one: the generator refuses audit entity types from a confidential module.

## Jobs

- None.

## Hooks

- None. Other modules call the public API instead.

## Public API

- `server/index.ts`: the `audit_log` table (`auditLog`); `writeAudit` and `AuditInput`; `latestAudit` (the dashboard's recent activity); `ACTOR` and `auditWhere`, the SQL the Grievance and Review Audit Logs reuse for the actor and the filters.
- `shared/index.ts`: `AUDIT_ACTIONS`, `AuditAction` and `auditActionLabel`; `auditQuerySchema` and `AuditQuery` (the grievance and review log schemas extend it); `AuditEntry` and `AuditPage`.
- `web/index.ts`: `AuditLog`, `auditColumns`, `auditSearch` and `AuditSearch` (the page every audit log draws); `logQuery`, `logCsvUrl` and `AuditParams` (a log's page and its CSV).

## Pages

- `/audit` (`web/routes/route.tsx`), in the Assets workspace.

## Gotchas

- The page's nav entry is the assets module's (`modules/assets/web/module.ts`), under the Assets workspace's Administration.
- `Actor` is the kernel's (`server/lib/actor.ts`), not this module's: the signed-in account extends it, and the confidential modules need it without writing here.
- The seed, the server CLI (`server/admin.ts`) and the failed sign-in that locks an account (`server/services/auth.ts`) insert into `audit_log` directly, so they skip the entity-type check. They write declared types only.
- `ActionBadge`, which draws an action on this page, is the kernel's (`web/src/components/status.tsx`).
