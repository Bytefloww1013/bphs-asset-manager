import { and, asc, eq, sql } from 'drizzle-orm'
import { grievanceEntryCode, grievanceStatusLabel, type GrievanceEntryKind, type GrievanceStatus } from '../../shared/constants.ts'
import type { GrievanceAttachmentWithdrawInput, GrievanceEntryCreateInput } from '../../shared/schemas.ts'
import type { GrievanceAttachment, GrievanceEntry } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { grievanceAttachments, grievanceEntries, grievances } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, HttpError, invalid, notFound } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { get } from '../lib/grievance-files.ts'
import { plainToRichText, requireRichText, type RichText } from '../lib/richtext.ts'
import type { Upload } from '../lib/uploads.ts'
import { attachmentShape, saveAttachments } from './grievance-attachments.ts'

// There is no update and no delete in this file, and there must never be: an entry is corrected by another entry.
// The one update here is a file's withdrawal, which the database allows once and nothing else.

/** The title of every grievance's first entry. The migration that back-fills it uses the same words. */
export const GRIEVANCE_RECORDED = 'Grievance recorded'

type EntryRow = typeof grievanceEntries.$inferSelect

const shape = (row: EntryRow, corrects: number | null = null, correctedBy: number[] = []): GrievanceEntry => ({
  id: row.id,
  seq: row.seq,
  kind: row.kind,
  occurredAt: row.occurredAt.toISOString(),
  recordedAt: row.recordedAt.toISOString(),
  title: row.title,
  shortDescription: row.shortDescription,
  bodyHtml: row.bodyHtml,
  documentedBy: row.documentedByLabel,
  corrects,
  correctedBy,
})

const findGrievance = (db: DbLike, code: string) => {
  const grievance = db.get<{ id: number; code: string; status: GrievanceStatus }>(sql`select id, code, status from grievances where code = ${code} collate nocase`)
  if (!grievance) throw notFound('Grievance')
  return grievance
}

/** Every entry of one grievance, in the order they were recorded. Putting them in the order things happened is the page's job. */
export function listGrievanceEntries(db: DbLike, code: string): GrievanceEntry[] {
  const rows = db.select().from(grievanceEntries).where(eq(grievanceEntries.grievanceId, findGrievance(db, code).id)).orderBy(asc(grievanceEntries.seq)).all()
  const seqOf = new Map(rows.map((row) => [row.id, row.seq]))
  return rows.map((row) =>
    shape(
      row,
      row.correctsEntryId === null ? null : seqOf.get(row.correctsEntryId)!,
      rows.filter((other) => other.correctsEntryId === row.id).map((other) => other.seq),
    ),
  )
}

interface NewEntry {
  kind: GrievanceEntryKind
  correctsEntryId?: number
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
      correctsEntryId: entry.correctsEntryId,
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

const findUnsealedGrievance = (db: DbLike, code: string) => {
  const grievance = findGrievance(db, code)
  if (SEALED.includes(grievance.status)) {
    throw conflict('grievance_sealed', `${grievance.code} is ${grievanceStatusLabel(grievance.status)}. Nothing more can be added to its timeline.`)
  }
  return grievance
}

/** Add an entry, and any files that came with it in the same request. */
export function createGrievanceEntry(db: Db, actor: Actor, code: string, input: GrievanceEntryCreateInput, uploads: Upload[] = []): GrievanceEntry {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const grievance = findUnsealedGrievance(tx, code)
    const now = new Date()
    let corrected: EntryRow | undefined
    if (input.kind === 'correction') {
      corrected = tx
        .select()
        .from(grievanceEntries)
        .where(and(eq(grievanceEntries.grievanceId, grievance.id), eq(grievanceEntries.seq, input.correctsSeq)))
        .get()
      if (!corrected) throw invalid(`${grievance.code} has no entry ${grievanceEntryCode(input.correctsSeq)} to correct.`, { field: 'correctsSeq' })
      // An automatic entry says what the app did; there is nothing in it that anyone wrote.
      if (corrected.kind === 'system') throw invalid('An automatic entry cannot be corrected.', { field: 'correctsSeq' })
    }
    const row = appendGrievanceEntry(tx, actor, grievance.id, {
      kind: input.kind,
      correctsEntryId: corrected?.id,
      occurredAt: input.kind === 'correction' ? now : new Date(input.occurredAt),
      title: input.title,
      shortDescription: input.shortDescription,
      body,
      at: now,
    })
    writeGrievanceAudit(tx, actor, {
      action: 'entry',
      entityType: 'grievance_entry',
      entityId: row.id,
      details: `${grievance.code} ${grievanceEntryCode(row.seq)} · ${input.title}`,
      at: now,
    })
    saveAttachments(tx, actor, grievance, row, uploads, now)
    return shape(row, corrected?.seq ?? null)
  })
}

/** Add files to a grievance on their own, from its page. An automatic entry records it on the timeline, and the files hang off that entry. */
export function addGrievanceAttachments(db: Db, actor: Actor, code: string, uploads: Upload[]): GrievanceAttachment[] {
  if (!uploads.length) throw invalid('Choose a file to attach.', { field: 'files' })
  return db.transaction((tx) => {
    const grievance = findUnsealedGrievance(tx, code)
    const now = new Date()
    const entry = appendGrievanceEntry(tx, actor, grievance.id, {
      kind: 'system',
      occurredAt: now,
      title: uploads.length === 1 ? 'File attached' : `${uploads.length} files attached`,
      shortDescription: uploads.map((upload) => upload.filename).join(', '),
      at: now,
    })
    return saveAttachments(tx, actor, grievance, entry, uploads, now)
  })
}

const attachmentRows = (db: DbLike, grievanceId: number, id?: number) =>
  db
    .select({ row: grievanceAttachments, seq: grievanceEntries.seq })
    .from(grievanceAttachments)
    .leftJoin(grievanceEntries, eq(grievanceEntries.id, grievanceAttachments.entryId))
    .where(and(eq(grievanceAttachments.grievanceId, grievanceId), id === undefined ? undefined : eq(grievanceAttachments.id, id)))
    .orderBy(asc(grievanceAttachments.id))
    .all()

/** Every file on one grievance, withdrawn ones too, in the order they were added. */
export function listGrievanceAttachments(db: DbLike, code: string): GrievanceAttachment[] {
  return attachmentRows(db, findGrievance(db, code).id).map(({ row, seq }) => attachmentShape(row, seq))
}

/** One of a grievance's files, or 404: an ID from another grievance is not found here. */
function findAttachment(db: DbLike, grievanceId: number, id: number) {
  const [found] = attachmentRows(db, grievanceId, id)
  if (!found) throw notFound('File')
  return found
}

/** A file's bytes, to be sent as a download. Every download is logged; a withdrawn file has none to give. */
export function downloadGrievanceAttachment(db: Db, actor: Actor, code: string, id: number) {
  return db.transaction((tx) => {
    const grievance = findGrievance(tx, code)
    const { row } = findAttachment(tx, grievance.id, id)
    if (row.withdrawnAt) throw new HttpError(410, 'attachment_withdrawn', `${row.filename} was withdrawn and can no longer be downloaded.`)
    const bytes = get(tx, row.id)
    if (!bytes) throw notFound('File')
    writeGrievanceAudit(tx, actor, { action: 'download', entityType: 'grievance_attachment', entityId: row.id, details: `${grievance.code} · ${row.filename}` })
    return { filename: row.filename, contentType: row.contentType, bytes }
  })
}

/**
 * Take back a file added by mistake. Its bytes stay in the database, but nothing in the app reads them again; its name, who
 * added it and the reason stay on the list, and an automatic entry records it on the timeline.
 */
export function withdrawGrievanceAttachment(db: Db, actor: Actor, code: string, id: number, input: GrievanceAttachmentWithdrawInput): GrievanceAttachment {
  return db.transaction((tx) => {
    const grievance = findUnsealedGrievance(tx, code)
    const { row, seq } = findAttachment(tx, grievance.id, id)
    if (row.withdrawnAt) throw conflict('attachment_withdrawn', `${row.filename} has already been withdrawn.`)
    const now = new Date()
    const withdrawn = tx
      .update(grievanceAttachments)
      .set({ withdrawnAt: now, withdrawnReason: input.reason })
      .where(eq(grievanceAttachments.id, row.id))
      .returning()
      .get()
    appendGrievanceEntry(tx, actor, grievance.id, { kind: 'system', occurredAt: now, title: 'File withdrawn', shortDescription: row.filename, body: plainToRichText(input.reason), at: now })
    writeGrievanceAudit(tx, actor, { action: 'withdraw', entityType: 'grievance_attachment', entityId: row.id, details: `${grievance.code} · ${row.filename}`, at: now })
    return attachmentShape(withdrawn, seq)
  })
}
