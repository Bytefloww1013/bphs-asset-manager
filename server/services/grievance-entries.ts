import { eq, sql } from 'drizzle-orm'
import { grievanceEntryCode, grievanceStatusLabel, type GrievanceEntryKind, type GrievanceStatus } from '../../shared/constants.ts'
import type { GrievanceEntryCreateInput } from '../../shared/schemas.ts'
import type { GrievanceEntry } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { grievanceEntries, grievances } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { requireRichText, type RichText } from '../lib/richtext.ts'

// There is no update and no delete in this file, and there must never be: an entry is corrected by another entry.

/** The title of every grievance's first entry. The migration that back-fills it uses the same words. */
export const GRIEVANCE_RECORDED = 'Grievance recorded'

type EntryRow = typeof grievanceEntries.$inferSelect

const shape = (row: EntryRow): GrievanceEntry => ({
  id: row.id,
  seq: row.seq,
  kind: row.kind,
  occurredAt: row.occurredAt.toISOString(),
  recordedAt: row.recordedAt.toISOString(),
  title: row.title,
  shortDescription: row.shortDescription,
  bodyHtml: row.bodyHtml,
  documentedBy: row.documentedByLabel,
})

interface NewEntry {
  kind: GrievanceEntryKind
  occurredAt: Date
  title: string
  shortDescription?: string
  body?: RichText
  at?: Date
}

/**
 * Append one entry and move the grievance's last activity on. Call inside the transaction of whatever it records.
 * Who documented it is the actor, always: nothing a request says can name anyone else.
 */
export function appendGrievanceEntry(tx: DbLike, actor: Actor, grievanceId: number, entry: NewEntry): EntryRow {
  const at = entry.at ?? new Date()
  // Read and written in one transaction, as the Grievance ID is; the unique index on (grievance, seq) backs it up.
  const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from grievance_entries where grievance_id = ${grievanceId}`)?.top ?? 0) + 1
  const row = tx
    .insert(grievanceEntries)
    .values({
      grievanceId,
      seq,
      kind: entry.kind,
      occurredAt: entry.occurredAt,
      recordedAt: at,
      title: entry.title,
      shortDescription: entry.shortDescription ?? '',
      bodyHtml: entry.body?.html ?? '',
      bodyText: entry.body?.text ?? '',
      documentedByEmployeeId: actor.employeeId,
      documentedByUserId: actor.id,
      documentedByLabel: actor.name,
    })
    .returning()
    .get()
  tx.update(grievances).set({ lastActivityAt: at }).where(eq(grievances.id, grievanceId)).run()
  return row
}

/** A grievance that is finished takes nothing more on its timeline. */
const SEALED: GrievanceStatus[] = ['closed', 'voided']

export function createGrievanceEntry(db: Db, actor: Actor, code: string, input: GrievanceEntryCreateInput): GrievanceEntry {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const grievance = tx.get<{ id: number; code: string; status: GrievanceStatus }>(sql`select id, code, status from grievances where code = ${code} collate nocase`)
    if (!grievance) throw notFound('Grievance')
    if (SEALED.includes(grievance.status)) {
      throw conflict('grievance_sealed', `${grievance.code} is ${grievanceStatusLabel(grievance.status)}. Nothing more can be added to its timeline.`)
    }
    const row = appendGrievanceEntry(tx, actor, grievance.id, { kind: input.kind, occurredAt: new Date(input.occurredAt), title: input.title, shortDescription: input.shortDescription, body })
    writeGrievanceAudit(tx, actor, {
      action: 'entry',
      entityType: 'grievance_entry',
      entityId: row.id,
      details: `${grievance.code} ${grievanceEntryCode(row.seq)} · ${input.title}`,
      at: row.recordedAt,
    })
    return shape(row)
  })
}
