import { and, desc, eq, sql } from 'drizzle-orm'
import { reviewCapCode, reviewCapSeq, reviewCapStatusLabel, type ReviewCapStatus } from '../../shared/constants.ts'
import { formatUsDate } from '../../shared/dates.ts'
import type { ReviewActionItemsExportInput, ReviewCapCreateInput, ReviewCapStatusInput, ReviewCapUpdateInput } from '../../shared/schemas.ts'
import type { ReviewActionItem, ReviewCap, ReviewDetail } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, reviewCaps, reviewEntries } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { writeReviewAudit } from '../lib/review-audit.ts'
import { plainToRichText, requireRichText } from '../lib/richtext.ts'
import { requireActiveEmployees } from './grievances.ts'
import { fullName } from './refs.ts'
import { appendReviewEntry, editRecord, findReviewToManage, getReview, iso, personJson, requireNotSealed, reviewsVisibleTo, toPerson, type FieldChange } from './reviews.ts'

// A CAP is never deleted, so its number is never given to another. Every change to one is on its review's history.

type Viewer = { employeeId: number | null }

/** A CAP's number from its address: CAP01, or a bare 1. */
function capSeqOf(param: string): number {
  const seq = reviewCapSeq(param)
  if (seq === null) throw notFound('CAP')
  return seq
}

interface RawCap {
  id: number
  seq: number
  title: string
  shortDescription: string
  bodyHtml: string
  responsible: string
  dueDate: string | null
  status: ReviewCapStatus
  version: number
  addedBy: string | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
  completedBy: string | null
}

/** The review's CAPs in number order, or just the one numbered `seq`. */
function capsOf(db: DbLike, reviewId: number, seq?: number): ReviewCap[] {
  return db
    .all<RawCap>(sql`
      select c.id as id, c.seq as seq, c.title as title, c.short_description as shortDescription, c.body_html as bodyHtml,
             ${personJson('e')} as responsible, c.due_date as dueDate, c.status as status, c.version as version, u.name as addedBy,
             c.created_at as createdAt, c.updated_at as updatedAt, c.completed_at as completedAt, c.completed_by_label as completedBy
      from review_caps c
        join employees e on e.id = c.responsible_employee_id
        left join users u on u.id = c.created_by_user_id
      where c.review_id = ${reviewId} ${seq === undefined ? sql`` : sql`and c.seq = ${seq}`}
      order by c.seq`)
    .map((row) => ({
      ...row,
      responsible: toPerson(row.responsible),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      completedAt: row.completedAt === null ? null : iso(row.completedAt),
    }))
}

function oneCap(db: DbLike, review: ReviewDetail, param: string): ReviewCap {
  const cap = capsOf(db, review.id, capSeqOf(param))[0]
  if (!cap) throw notFound('CAP')
  return cap
}

/** Every CAP on a review the viewer may see. */
export function listReviewCaps(db: DbLike, viewer: Viewer, code: string): ReviewCap[] {
  return capsOf(db, getReview(db, viewer, { code }).id)
}

export function getReviewCap(db: DbLike, viewer: Viewer, code: string, param: string): ReviewCap {
  return oneCap(db, getReview(db, viewer, { code }), param)
}

const nameOf = (db: DbLike, id: number) => {
  const row = db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, id)).get()
  return row ? fullName(row.firstName, row.lastName) : ''
}

/** Add a CAP to a review, as Not started. */
export function createReviewCap(db: Db, actor: Actor, code: string, input: ReviewCapCreateInput): ReviewCap {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const review = findReviewToManage(tx, actor, code)
    requireNotSealed(review, 'add a CAP')
    requireActiveEmployees(tx, [input.responsibleId], 'responsibleId')
    const now = new Date()
    const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from review_caps where review_id = ${review.id}`)?.top ?? 0) + 1
    const row = tx
      .insert(reviewCaps)
      .values({
        reviewId: review.id,
        seq,
        title: input.title,
        shortDescription: input.shortDescription,
        bodyHtml: body.html,
        bodyText: body.text,
        responsibleEmployeeId: input.responsibleId,
        dueDate: input.dueDate,
        createdByUserId: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: reviewCaps.id })
      .get()
    const label = reviewCapCode(seq)
    const due = input.dueDate ? ` Due: ${formatUsDate(input.dueDate)}.` : ''
    appendReviewEntry(tx, actor, review.id, {
      kind: 'system',
      capId: row.id,
      occurredAt: now,
      title: `${label} added: ${input.title}. Responsible: ${nameOf(tx, input.responsibleId)}.${due}`,
      at: now,
    })
    writeReviewAudit(tx, actor, { action: 'create', entityType: 'cap', entityId: row.id, reviewId: review.id, details: `${review.code} ${label} · ${input.title}`, at: now })
    return oneCap(tx, review, String(seq))
  })
}

/** The review and the CAP as they stand, for a change to the CAP, refused as a change to its review would be, and once the review is Completed. */
function findCapToManage(tx: DbLike, actor: Actor, code: string, param: string, version: number) {
  const review = findReviewToManage(tx, actor, code)
  const cap = oneCap(tx, review, param)
  requireNotSealed(review, 'change a CAP')
  if (cap.version !== version) {
    const last = tx
      .select({ by: reviewEntries.documentedByLabel })
      .from(reviewEntries)
      .where(and(eq(reviewEntries.capId, cap.id), eq(reviewEntries.kind, 'system')))
      .orderBy(desc(reviewEntries.seq))
      .get()
    throw conflict('stale_version', `${reviewCapCode(cap.seq)} was changed${last ? ` by ${last.by}` : ''} while you had it open. Nothing has been saved.`, { version: cap.version })
  }
  return { review, cap, label: reviewCapCode(cap.seq) }
}

/** Change what a CAP says, who is responsible for it, or when it is due. Its history entry keeps what each field said before. */
export function updateReviewCap(db: Db, actor: Actor, code: string, param: string, input: ReviewCapUpdateInput): ReviewCap {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const { review, cap, label } = findCapToManage(tx, actor, code, param, input.version)
    if (cap.status === 'completed' || cap.status === 'cancelled') throw conflict('cap_closed', `${label} is ${reviewCapStatusLabel(cap.status)}. Reopen it before editing it.`)
    if (input.responsibleId !== cap.responsible.id) requireActiveEmployees(tx, [input.responsibleId], 'responsibleId')

    const due = (date: string | null) => (date ? formatUsDate(date)! : 'None')
    const changes: FieldChange[] = []
    if (input.title !== cap.title) changes.push(['Title', cap.title, input.title])
    if (input.shortDescription !== cap.shortDescription) changes.push(['Short description', cap.shortDescription, input.shortDescription])
    if (input.responsibleId !== cap.responsible.id) changes.push(['Responsible', cap.responsible.name, nameOf(tx, input.responsibleId)])
    if (input.dueDate !== cap.dueDate) changes.push(['Due date', due(cap.dueDate), due(input.dueDate)])
    if (body.html !== cap.bodyHtml) changes.push(['Details'])
    if (changes.length === 0) throw conflict('unchanged', 'Nothing has been changed, so there is nothing to save.')

    const now = new Date()
    tx.update(reviewCaps)
      .set({
        title: input.title,
        shortDescription: input.shortDescription,
        bodyHtml: body.html,
        bodyText: body.text,
        responsibleEmployeeId: input.responsibleId,
        dueDate: input.dueDate,
        version: cap.version + 1,
        updatedAt: now,
      })
      .where(and(eq(reviewCaps.id, cap.id), eq(reviewCaps.version, cap.version)))
      .run()
    const summary = `${label} edited: ${changes.map(([field]) => field).join(', ')}`
    const record = editRecord(changes, body.html !== cap.bodyHtml ? [['Details before', cap.bodyHtml]] : [])
    appendReviewEntry(tx, actor, review.id, { kind: 'system', capId: cap.id, occurredAt: now, title: summary, body: record, at: now })
    writeReviewAudit(tx, actor, { action: 'update', entityType: 'cap', entityId: cap.id, reviewId: review.id, details: `${review.code} ${label} · ${input.title} · ${summary}`, at: now })
    return oneCap(tx, review, String(cap.seq))
  })
}

/**
 * Move a CAP between Not started, In progress, Completed and Cancelled, in any direction. Completed is stamped with when and by
 * whom; any other status clears the stamp, and the history keeps the earlier completion. A note goes on the history entry.
 */
export function changeReviewCapStatus(db: Db, actor: Actor, code: string, param: string, input: ReviewCapStatusInput): ReviewCap {
  return db.transaction((tx) => {
    const { review, cap, label } = findCapToManage(tx, actor, code, param, input.version)
    if (cap.status === input.status) throw conflict('status_unchanged', `${label} is already ${reviewCapStatusLabel(input.status)}.`, { field: 'status' })
    const now = new Date()
    const completed = input.status === 'completed'
    tx.update(reviewCaps)
      .set({
        status: input.status,
        version: cap.version + 1,
        updatedAt: now,
        completedAt: completed ? now : null,
        completedByUserId: completed ? actor.id : null,
        completedByLabel: completed ? actor.name : null,
      })
      .where(and(eq(reviewCaps.id, cap.id), eq(reviewCaps.version, cap.version)))
      .run()
    const summary = `${label}: ${reviewCapStatusLabel(cap.status)} → ${reviewCapStatusLabel(input.status)}`
    appendReviewEntry(tx, actor, review.id, { kind: 'system', capId: cap.id, occurredAt: now, title: summary, body: plainToRichText(input.note), at: now })
    writeReviewAudit(tx, actor, { action: 'status', entityType: 'cap', entityId: cap.id, reviewId: review.id, details: `${review.code} ${label} · ${cap.title} · ${summary}`, at: now })
    return oneCap(tx, review, String(cap.seq))
  })
}

interface RawItem extends Pick<RawCap, 'id' | 'seq' | 'title' | 'shortDescription' | 'responsible' | 'dueDate' | 'status' | 'completedAt'> {
  reviewCode: string
  reviewTitle: string
}

/**
 * Every CAP on the reviews the viewer may see, earliest due first and undated last. A voided review was entered by mistake, so
 * its CAPs are not action items. The page filters and searches this list itself.
 */
export function listReviewActionItems(db: DbLike, viewer: Viewer): ReviewActionItem[] {
  return db
    .all<RawItem>(sql`
      select c.id as id, c.seq as seq, c.title as title, c.short_description as shortDescription, ${personJson('e')} as responsible,
             c.due_date as dueDate, c.status as status, c.completed_at as completedAt, r.code as reviewCode, r.title as reviewTitle
      from review_caps c
        join reviews r on r.id = c.review_id
        join employees e on e.id = c.responsible_employee_id
      where ${reviewsVisibleTo(viewer)} and r.status != 'voided'
      order by c.due_date is null, c.due_date, r.code, c.seq`)
    .map(({ reviewCode, reviewTitle, ...row }) => ({
      ...row,
      responsible: toPerson(row.responsible),
      completedAt: row.completedAt === null ? null : iso(row.completedAt),
      review: { code: reviewCode, title: reviewTitle },
    }))
}

/** Log a copy of the Action items list. The browser makes the file, so the page reports each one here. */
export function recordActionItemsExport(db: DbLike, actor: Actor, input: ReviewActionItemsExportInput) {
  const rows = `${input.rows} ${input.rows === 1 ? 'row' : 'rows'}`
  writeReviewAudit(db, actor, { action: 'export', entityType: 'cap', entityId: null, reviewId: null, details: `Action items · ${rows} · ${input.format === 'csv' ? 'CSV' : 'Excel workbook'}` })
}
