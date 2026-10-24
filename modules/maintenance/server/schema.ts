import { employees } from '#foundation/employees/server/index.ts'
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'
import type { MaintenanceStatus } from '../shared/constants.ts'

/** A maintenance request, from the Zoho form's webhook or entered by hand. What Zoho sends is kept as the text it sent. */
export const maintenanceRequests = sqliteTable(
  'maintenance_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    /** Empty when none was given, as for a request phoned in. */
    email: text('email').notNull(),
    program: text('program').notNull(),
    location: text('location').notNull(),
    description: text('description').notNull(),
    urgent: text('urgent'),
    requestDate: text('request_date'),
    noticedDate: text('noticed_date'),
    /** Zoho's Added Time, as Zoho formats it. Null for a request entered by hand. */
    zohoAddedTime: text('zoho_added_time'),
    receivedAt: ms('received_at').notNull(),
    status: text('status').$type<MaintenanceStatus>().notNull().default('not_started'),
    assignedEmployeeId: integer('assigned_employee_id').references(() => employees.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // The same Zoho entry sent twice. Hand entries have no Added Time, and nulls never collide.
    uniqueIndex('uq_maintenance_dedupe').on(t.email, t.zohoAddedTime),
    index('ix_maintenance_received').on(t.receivedAt),
    check(
      'ck_maintenance_status',
      sql`${t.status} in ('not_started', 'dispatched', 'on_hold', 'rejected', 'finished')`,
    ),
    // Dispatched means someone has it; Not Started means nobody does yet.
    check(
      'ck_maintenance_dispatch',
      sql`(${t.status} != 'dispatched' or ${t.assignedEmployeeId} is not null) and (${t.status} != 'not_started' or ${t.assignedEmployeeId} is null)`,
    ),
  ],
)

/** A request's timeline: notes, and the lines the app writes when the request changes. */
export const maintenanceNotes = sqliteTable(
  'maintenance_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id')
      .notNull()
      .references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'note' | 'system'>().notNull(),
    body: text('body').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The writer's name as it was, or "Zoho Forms". */
    createdByLabel: text('created_by_label').notNull(),
    createdAt: ms('created_at').notNull(),
  },
  (t) => [
    index('ix_maintenance_notes_request').on(t.requestId, t.createdAt),
    check('ck_maintenance_notes_kind', sql`${t.kind} in ('note', 'system')`),
  ],
)
