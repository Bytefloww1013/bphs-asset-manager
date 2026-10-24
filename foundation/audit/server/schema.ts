import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'
import type { AuditAction } from '../shared/constants.ts'

/** Append-only. Nothing in the app updates or deletes these rows. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: ms('occurred_at').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Snapshot of the actor's email so history survives renames and deactivation. Entries from before October 2026 hold only the part before the @. */
    actor: text('actor').notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    details: text('details').notNull().default(''),
  },
  (t) => [index('ix_audit_time').on(t.occurredAt), index('ix_audit_action').on(t.action)],
)
