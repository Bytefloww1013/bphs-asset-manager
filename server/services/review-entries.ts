import { and, asc, eq } from 'drizzle-orm'
import { reviewCapCode, reviewEntryCode } from '../../shared/constants.ts'
import type { ReviewEntryCreateInput } from '../../shared/schemas.ts'
import type { ReviewEntry } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { reviewCaps, reviewEntries } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { invalid } from '../lib/errors.ts'
import { writeReviewAudit } from '../lib/review-audit.ts'
import { requireRichText } from '../lib/richtext.ts'
import { appendReviewEntry, findReviewToManage, getReview, requireNotSealed } from './reviews.ts'

// There is no update and no delete in this file, and there must never be: an entry is corrected by another entry.

type EntryRow = typeof reviewEntries.$inferSelect

const shape = (row: EntryRow, cap: number | null, corrects: number | null = null, correctedBy: number[] = []): ReviewEntry => ({
  id: row.id,
  seq: row.seq,
  kind: row.kind,
  cap,
  occurredAt: row.occurredAt.toISOString(),
  recordedAt: row.recordedAt.toISOString(),
  title: row.title,
  shortDescription: row.shortDescription,
  bodyHtml: row.bodyHtml,
  documentedBy: row.documentedByLabel,
  corrects,
  correctedBy,
})

/** Every entry of one review the viewer may see, in the order they were recorded. */
export function listReviewEntries(db: DbLike, viewer: { employeeId: number | null }, code: string): ReviewEntry[] {
  const review = getReview(db, viewer, { code })
  const rows = db.select().from(reviewEntries).where(eq(reviewEntries.reviewId, review.id)).orderBy(asc(reviewEntries.seq)).all()
  const seqOf = new Map(rows.map((row) => [row.id, row.seq]))
  const capSeqOf = new Map(db.select({ id: reviewCaps.id, seq: reviewCaps.seq }).from(reviewCaps).where(eq(reviewCaps.reviewId, review.id)).all().map((cap) => [cap.id, cap.seq]))
  return rows.map((row) =>
    shape(
      row,
      row.capId === null ? null : capSeqOf.get(row.capId)!,
      row.correctsEntryId === null ? null : seqOf.get(row.correctsEntryId)!,
      rows.filter((other) => other.correctsEntryId === row.id).map((other) => other.seq),
    ),
  )
}

/** Add an update to a review's history, or to one of its CAPs, or a correction of an earlier entry, filed where that entry is. */
export function createReviewEntry(db: Db, actor: Actor, code: string, input: ReviewEntryCreateInput): ReviewEntry {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const review = findReviewToManage(tx, actor, code)
    requireNotSealed(review, 'add to its history')
    const now = new Date()
    let corrected: EntryRow | undefined
    let cap: { id: number; seq: number } | undefined
    if (input.kind === 'update' && input.capSeq !== undefined) {
      cap = tx.select({ id: reviewCaps.id, seq: reviewCaps.seq }).from(reviewCaps).where(and(eq(reviewCaps.reviewId, review.id), eq(reviewCaps.seq, input.capSeq))).get()
      if (!cap) throw invalid(`${review.code} has no ${reviewCapCode(input.capSeq)}.`, { field: 'capSeq' })
    }
    if (input.kind === 'correction') {
      corrected = tx
        .select()
        .from(reviewEntries)
        .where(and(eq(reviewEntries.reviewId, review.id), eq(reviewEntries.seq, input.correctsSeq)))
        .get()
      if (!corrected) throw invalid(`${review.code} has no entry ${reviewEntryCode(input.correctsSeq)} to correct.`, { field: 'correctsSeq' })
      // An automatic entry says what the app did; there is nothing in it that anyone wrote.
      if (corrected.kind === 'system') throw invalid('An automatic entry cannot be corrected.', { field: 'correctsSeq' })
      if (corrected.capId !== null) cap = tx.select({ id: reviewCaps.id, seq: reviewCaps.seq }).from(reviewCaps).where(eq(reviewCaps.id, corrected.capId)).get()
    }
    const row = appendReviewEntry(tx, actor, review.id, {
      kind: input.kind,
      capId: cap?.id,
      correctsEntryId: corrected?.id,
      occurredAt: input.kind === 'correction' ? now : new Date(input.occurredAt),
      title: input.title,
      shortDescription: input.shortDescription,
      body,
      at: now,
    })
    writeReviewAudit(tx, actor, {
      action: 'entry',
      entityType: 'entry',
      entityId: row.id,
      reviewId: review.id,
      details: `${review.code} ${reviewEntryCode(row.seq)} · ${input.title}`,
      at: now,
    })
    return shape(row, cap?.seq ?? null, corrected?.seq ?? null)
  })
}
