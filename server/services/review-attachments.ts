import { and, asc, eq } from 'drizzle-orm'
import { reviewCapCode } from '../../shared/constants.ts'
import type { ReviewAttachmentWithdrawInput, ReviewAttachmentsInput } from '../../shared/schemas.ts'
import type { ReviewAttachment } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { reviewAttachments, reviewCaps, reviewEntries } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, HttpError, invalid, notFound } from '../lib/errors.ts'
import { writeReviewAudit } from '../lib/review-audit.ts'
import { get, put } from '../lib/review-files.ts'
import { plainToRichText } from '../lib/richtext.ts'
import type { Upload } from '../lib/uploads.ts'
import { appendReviewEntry, findCapBySeq, findReviewToManage, getReview, requireNotSealed } from './reviews.ts'

// As with grievance files, the one update here is a file's withdrawal, which the database allows once and nothing else.

type Cap = { id: number; seq: number } | null

const shape = (row: typeof reviewAttachments.$inferSelect, entrySeq: number, cap: number | null): ReviewAttachment => ({
  id: row.id,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
  sha256: row.sha256,
  entrySeq,
  cap,
  uploadedBy: row.uploadedByLabel,
  uploadedAt: row.uploadedAt.toISOString(),
  withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  withdrawnReason: row.withdrawnReason,
})

const where = (review: { code: string }, cap: Cap) => (cap ? `${review.code} ${reviewCapCode(cap.seq)}` : review.code)
const onCap = (cap: Cap, title: string) => (cap ? `${reviewCapCode(cap.seq)}: ${title}` : title)

/**
 * Write checked files onto a review, or one of its CAPs, inside the transaction of whatever they came with. One automatic entry
 * records them, filed where they are, and the files hang off it; each file has its own Review Audit Log entry.
 */
export function saveReviewAttachments(
  tx: DbLike,
  actor: Actor,
  review: { id: number; code: string },
  cap: Cap,
  uploads: Upload[],
  at: Date,
): ReviewAttachment[] {
  if (!uploads.length) return []
  const entry = appendReviewEntry(tx, actor, review.id, {
    kind: 'system',
    capId: cap?.id,
    occurredAt: at,
    title: onCap(cap, uploads.length === 1 ? 'File attached' : `${uploads.length} files attached`),
    shortDescription: uploads.map((upload) => upload.filename).join(', '),
    at,
  })
  return uploads.map(({ bytes, ...upload }) => {
    const row = tx
      .insert(reviewAttachments)
      .values({
        reviewId: review.id,
        capId: cap?.id,
        entryId: entry.id,
        ...upload,
        size: bytes.length,
        uploadedByUserId: actor.id,
        uploadedByLabel: actor.name,
        uploadedAt: at,
      })
      .returning()
      .get()
    put(tx, row.id, bytes)
    writeReviewAudit(tx, actor, {
      action: 'attach',
      entityType: 'attachment',
      entityId: row.id,
      reviewId: review.id,
      details: `${where(review, cap)} · ${row.filename}`,
      at,
    })
    return shape(row, entry.seq, cap?.seq ?? null)
  })
}

/** Add files to a review, or to one of its CAPs, on their own, from its page. */
export function addReviewAttachments(
  db: Db,
  actor: Actor,
  code: string,
  input: ReviewAttachmentsInput,
  uploads: Upload[],
): ReviewAttachment[] {
  if (!uploads.length) throw invalid('Choose a file to attach.', { field: 'files' })
  return db.transaction((tx) => {
    const review = findReviewToManage(tx, actor, code)
    requireNotSealed(review, 'attach files')
    const cap = input.capSeq === undefined ? null : findCapBySeq(tx, review, input.capSeq)
    return saveReviewAttachments(tx, actor, review, cap, uploads, new Date())
  })
}

const attachmentRows = (db: DbLike, reviewId: number, id?: number) =>
  db
    .select({ row: reviewAttachments, entrySeq: reviewEntries.seq, cap: reviewCaps.seq })
    .from(reviewAttachments)
    .innerJoin(reviewEntries, eq(reviewEntries.id, reviewAttachments.entryId))
    .leftJoin(reviewCaps, eq(reviewCaps.id, reviewAttachments.capId))
    .where(and(eq(reviewAttachments.reviewId, reviewId), id === undefined ? undefined : eq(reviewAttachments.id, id)))
    .orderBy(asc(reviewAttachments.id))
    .all()

/** Every file on one review the viewer may see, its CAPs' too, withdrawn ones as well, in the order they were added. */
export function listReviewAttachments(
  db: DbLike,
  viewer: { employeeId: number | null },
  code: string,
): ReviewAttachment[] {
  return attachmentRows(db, getReview(db, viewer, { code }).id).map(({ row, entrySeq, cap }) =>
    shape(row, entrySeq, cap),
  )
}

/** One of a review's files, or 404: an ID from another review is not found here. */
function findAttachment(db: DbLike, reviewId: number, id: number) {
  const [found] = attachmentRows(db, reviewId, id)
  if (!found) throw notFound('File')
  return found
}

/** A file's bytes, to be sent as a download. Every download is logged; a withdrawn file has none to give. */
export function downloadReviewAttachment(db: Db, actor: Actor, code: string, id: number) {
  return db.transaction((tx) => {
    const review = getReview(tx, actor, { code })
    const { row, cap } = findAttachment(tx, review.id, id)
    if (row.withdrawnAt)
      throw new HttpError(410, 'attachment_withdrawn', `${row.filename} was withdrawn and can no longer be downloaded.`)
    const bytes = get(tx, row.id)
    if (!bytes) throw notFound('File')
    const capRef = cap === null ? null : { id: row.capId!, seq: cap }
    writeReviewAudit(tx, actor, {
      action: 'download',
      entityType: 'attachment',
      entityId: row.id,
      reviewId: review.id,
      details: `${where(review, capRef)} · ${row.filename}`,
    })
    return { filename: row.filename, contentType: row.contentType, bytes }
  })
}

/**
 * Take back a file added by mistake. Its bytes stay in the database, but nothing in the app reads them again; its name, who added
 * it and the reason stay on the list, and an automatic entry, filed where the file is, records it on the history.
 */
export function withdrawReviewAttachment(
  db: Db,
  actor: Actor,
  code: string,
  id: number,
  input: ReviewAttachmentWithdrawInput,
): ReviewAttachment {
  return db.transaction((tx) => {
    const review = findReviewToManage(tx, actor, code)
    requireNotSealed(review, 'withdraw a file')
    const { row, entrySeq, cap } = findAttachment(tx, review.id, id)
    if (row.withdrawnAt) throw conflict('attachment_withdrawn', `${row.filename} has already been withdrawn.`)
    const now = new Date()
    const withdrawn = tx
      .update(reviewAttachments)
      .set({ withdrawnAt: now, withdrawnReason: input.reason })
      .where(eq(reviewAttachments.id, row.id))
      .returning()
      .get()
    const capRef = cap === null ? null : { id: row.capId!, seq: cap }
    appendReviewEntry(tx, actor, review.id, {
      kind: 'system',
      capId: capRef?.id,
      occurredAt: now,
      title: onCap(capRef, 'File withdrawn'),
      shortDescription: row.filename,
      body: plainToRichText(input.reason),
      at: now,
    })
    writeReviewAudit(tx, actor, {
      action: 'withdraw',
      entityType: 'attachment',
      entityId: row.id,
      reviewId: review.id,
      details: `${where(review, capRef)} · ${row.filename}`,
      at: now,
    })
    return shape(withdrawn, entrySeq, cap)
  })
}
