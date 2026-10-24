import { employees } from '#foundation/employees/server/index.ts'
import { programs } from '#foundation/programs/server/index.ts'
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'

/**
 * One row per time an item was held: open while `returned_at` is empty. `kind` and `item_id` name the item; no foreign key can
 * follow them, so each kind's table has a trigger instead (migration 0024): an item can't be deleted once it has history, and a
 * row can't name an item that isn't there.
 */
export const assignments = sqliteTable(
  'assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** The registered kind (`custody.kinds`): `asset` or `digital-asset`. */
    kind: text('kind').notNull(),
    itemId: integer('item_id').notNull(),
    /** The holder is an employee or a program, never both and never neither; the check below holds that. */
    employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'restrict' }),
    programId: integer('program_id').references(() => programs.id, { onDelete: 'restrict' }),
    issuedAt: ms('issued_at').notNull(),
    returnedAt: ms('returned_at'),
    issuedById: integer('issued_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    returnedById: integer('returned_by_id').references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // One open assignment per item, enforced by the database as well as the app.
    uniqueIndex('uq_assignments_one_open_per_item')
      .on(t.kind, t.itemId)
      .where(sql`${t.returnedAt} is null`),
    index('ix_assignments_employee').on(t.employeeId),
    index('ix_assignments_program').on(t.programId),
    index('ix_assignments_item').on(t.kind, t.itemId),
    check('ck_assignments_one_holder', sql`(${t.employeeId} is null) <> (${t.programId} is null)`),
  ],
)
