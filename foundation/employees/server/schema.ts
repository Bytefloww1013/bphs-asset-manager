import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createdAt, ms } from '#kernel/db/columns.ts'

export const employees = sqliteTable(
  'employees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    department: text('department'),
    jobTitle: text('job_title'),
    /** Set when an Employee with history leaves; they are archived, never deleted. */
    archivedAt: ms('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [index('ix_employees_name').on(t.lastName, t.firstName)],
)
