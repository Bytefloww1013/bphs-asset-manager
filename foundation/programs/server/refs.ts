import { eq } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import { notFound } from '#kernel/lib/errors.ts'
import type { ProgramRef } from '../shared/types.ts'
import { programs } from './schema.ts'

export function programRef(row: Pick<typeof programs.$inferSelect, 'id' | 'code' | 'name'>): ProgramRef {
  return { id: row.id, code: row.code, name: row.name }
}

export function requireProgram(db: DbLike, id: number) {
  const program = db.select().from(programs).where(eq(programs.id, id)).get()
  if (!program) throw notFound('Program')
  return program
}
