---
description: Every change is audited in its own transaction and no record's history is ever overwritten or deleted
scope: root
covers: [audit, history, delete, custody, transaction, triggers, withdraw, destructive-actions, confidential]
---

# Audit and history

The record is the product: history is never overwritten or silently deleted.

## Writing audit entries

- Every create, change, issue, return or withdrawal writes one audit entry, inside the same transaction as the change.
- Non-confidential modules call `writeAudit` (`foundation/audit/server/index.ts`) with an `entityType` their manifest declares in `auditEntityTypes`; an undeclared type throws.
- Confidential modules (Grievances, Reviews) keep their own audit log (`writeGrievanceAudit`, `writeReviewAudit`) and declare no `auditEntityTypes`; `modules:gen` refuses one that does.
- In seeds, write audit through the `SeedKit` audit writer, not a direct insert.

## Never delete history

- Audit tables are append-only: their migrations add `no_delete`, `no_update` and `no_replace` triggers. A new audit or ledger table gets the same three.
- An item with custody history cannot be deleted: each asset module ships a `*_keep_held` trigger. A new custody kind ships one too.
- Record content that must go away is withdrawn, not deleted: keep the row, mark it withdrawn, answer later reads with `410 attachment_withdrawn` (or the module's equivalent).
- Corrections are new entries that point at the one they correct, never edits to the old one.

## In the UI

- A destructive action that a record rule blocks stays visible, disabled, with the rule behind it in words, for a user who has the permission. A user without the permission never sees it (`docs/directives/ui-rules.md`).
