import { sql } from 'drizzle-orm'
import { grievanceCode } from '../../shared/constants.ts'
import type { DbLike } from '../db/client.ts'

/**
 * The next Grievance ID for the year the record is entered in (not the year of Date Made). Call inside the transaction that
 * inserts the grievance: SQLite allows one writer at a time and the unique index on (year, seq) backs it up, so two people
 * saving at once cannot be given the same ID.
 */
export function nextGrievanceCode(tx: DbLike, at: Date = new Date()): { code: string; year: number; seq: number } {
  const year = at.getFullYear()
  const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from grievances where year = ${year}`)?.top ?? 0) + 1
  return { code: grievanceCode(year, seq), year, seq }
}
