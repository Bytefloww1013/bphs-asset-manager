import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { REVIEW_STATUSES, reviewCode, type ReviewEntryKind, type ReviewStatus } from '../../shared/constants.ts'
import { formatUsDate } from '../../shared/dates.ts'
import { canManageReview, reviewManageReason } from '../../shared/permissions.ts'
import type { ReviewCreateInput, ReviewListQuery, ReviewUpdateInput } from '../../shared/schemas.ts'
import type { ReviewDetail, ReviewList, ReviewPerson } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, reviewEntries, reviews } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, forbidden, invalid, notFound } from '../lib/errors.ts'
import { writeReviewAudit } from '../lib/review-audit.ts'
import { cleanRichText, plainToRichText, requireRichText, type RichText } from '../lib/richtext.ts'
import { requireActiveEmployees } from './grievances.ts'
import { fullName } from './refs.ts'

/** Whoever is asking: all a query needs to know to hide from them the reviews about them. */
type Viewer = { employeeId: number | null }

/**
 * The one condition that hides a review from the account linked to its employee reviewed, at every level, Super Admin included
 * (R9). Every query that reads reviews, or anything on one, uses it; the review must be aliased `r`.
 */
export const reviewsVisibleTo = (viewer: Viewer) => sql`r.employee_id is not ${viewer.employeeId}`

/** The next Review ID for the year, as `nextGrievanceCode` gives a Grievance ID. Call inside the transaction that inserts the review. */
export function nextReviewCode(tx: DbLike, at: Date = new Date()): { code: string; year: number; seq: number } {
  const year = at.getFullYear()
  const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from reviews where year = ${year}`)?.top ?? 0) + 1
  return { code: reviewCode(year, seq), year, seq }
}

/** An employee as a JSON column, for `toPerson`. */
export const personJson = (alias: 'e' | 'v') =>
  sql.raw(`json_object('id', ${alias}.id, 'code', ${alias}.code, 'first', ${alias}.first_name, 'last', ${alias}.last_name, 'archived', ${alias}.archived_at is not null)`)

export const toPerson = (json: string): ReviewPerson => {
  const p = JSON.parse(json) as { id: number; code: string; first: string; last: string; archived: number }
  return { id: p.id, code: p.code, name: fullName(p.first, p.last), archived: p.archived === 1 }
}

export const iso = (ms: number) => new Date(ms).toISOString()

interface RawReview {
  id: number
  code: string
  title: string
  summary: string
  findings: string
  bodyHtml: string
  reviewDate: string
  status: ReviewStatus
  version: number
  createdAt: number
  lastActivityAt: number
  completedAt: number | null
  employee: string
  reviewer: string
  recordedBy: string | null
}

/** One review in full, by row id or Review ID. One the viewer may not see is not found, so its existence is not confirmed. */
export function getReview(db: DbLike, viewer: Viewer, key: { id: number } | { code: string }): ReviewDetail {
  const row = db.get<RawReview>(sql`
    select r.id as id, r.code as code, r.title as title, r.summary as summary, r.findings as findings, r.body_html as bodyHtml,
           r.review_date as reviewDate, r.status as status, r.version as version, r.created_at as createdAt,
           r.last_activity_at as lastActivityAt, r.completed_at as completedAt,
           ${personJson('e')} as employee, ${personJson('v')} as reviewer, u.name as recordedBy
    from reviews r
      join employees e on e.id = r.employee_id
      join employees v on v.id = r.reviewer_id
      left join users u on u.id = r.created_by_user_id
    where ${'id' in key ? sql`r.id = ${key.id}` : sql`r.code = ${key.code} collate nocase`} and ${reviewsVisibleTo(viewer)}`)
  if (!row) throw notFound('Review')
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    summary: row.summary,
    findings: row.findings,
    bodyHtml: row.bodyHtml,
    reviewDate: row.reviewDate,
    status: row.status,
    employee: toPerson(row.employee),
    reviewer: toPerson(row.reviewer),
    version: row.version,
    recordedBy: row.recordedBy,
    createdAt: iso(row.createdAt),
    lastActivityAt: iso(row.lastActivityAt),
    completedAt: row.completedAt === null ? null : iso(row.completedAt),
  }
}

/** The review as it stands, for a change to it: for its reviewer's account and for Edit access, and never once it is voided. */
export function findReviewToManage(tx: DbLike, actor: Actor, code: string): ReviewDetail {
  const review = getReview(tx, actor, { code })
  if (!canManageReview(actor, review.reviewer.id)) throw forbidden(reviewManageReason(review.reviewer.name))
  if (review.status === 'voided') throw conflict('review_voided', `${review.code} has been voided. It is kept as a record and cannot be changed.`)
  return review
}

/** A Completed review takes nothing new until it is reopened. A voided one has already been refused by `findReviewToManage`. */
export function requireNotSealed(review: ReviewDetail, doing: string) {
  if (review.status === 'completed') throw conflict('review_sealed', `${review.code} is Completed. Reopen it to ${doing}.`)
}

export interface NewReviewEntry {
  kind: ReviewEntryKind
  capId?: number
  correctsEntryId?: number
  occurredAt: Date
  title: string
  shortDescription?: string
  body?: RichText
  at?: Date
}

/**
 * Append one entry to a review's history and move its last activity on. Call inside the transaction of whatever it records.
 * Who documented it is the actor, always: nothing a request says can name anyone else.
 */
export function appendReviewEntry(tx: DbLike, actor: Actor, reviewId: number, entry: NewReviewEntry) {
  const at = entry.at ?? new Date()
  const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from review_entries where review_id = ${reviewId}`)?.top ?? 0) + 1
  const row = tx
    .insert(reviewEntries)
    .values({
      reviewId,
      capId: entry.capId,
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
  tx.update(reviews).set({ lastActivityAt: at }).where(eq(reviews.id, reviewId)).run()
  return row
}

/** The title of every review's first entry. */
export const REVIEW_CREATED = 'Review created'

// The review would vanish from the person who just wrote it, and nobody should record a review of themselves.
const notYourself = (actor: Actor, employeeId: number) => {
  if (employeeId === actor.employeeId) throw invalid('You cannot name yourself as the employee reviewed.', { field: 'employeeId' })
}

/** Record a review, as Open. */
export function createReview(db: Db, actor: Actor, input: ReviewCreateInput): ReviewDetail {
  const body = requireRichText(input.body, 'body', { optional: true })
  notYourself(actor, input.employeeId)
  const id = db.transaction((tx) => {
    requireActiveEmployees(tx, [input.reviewerId], 'reviewerId')
    requireActiveEmployees(tx, [input.employeeId], 'employeeId')
    const now = new Date()
    const { code, year, seq } = nextReviewCode(tx, now)
    const row = tx
      .insert(reviews)
      .values({
        code,
        year,
        seq,
        title: input.title,
        summary: input.summary,
        findings: input.findings,
        bodyHtml: body.html,
        bodyText: body.text,
        reviewDate: input.reviewDate,
        employeeId: input.employeeId,
        reviewerId: input.reviewerId,
        createdByUserId: actor.id,
        createdAt: now,
        lastActivityAt: now,
      })
      .returning({ id: reviews.id })
      .get()
    appendReviewEntry(tx, actor, row.id, { kind: 'system', occurredAt: now, title: REVIEW_CREATED, at: now })
    writeReviewAudit(tx, actor, { action: 'create', entityType: 'review', entityId: row.id, reviewId: row.id, details: `${code} · ${input.title}`, at: now })
    return row.id
  })
  return getReview(db, actor, { id })
}

const EDITED = 'Edited: '

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escape = (text: string) => text.replace(/[&<>"]/g, (m) => ESCAPES[m]!)

/** A field an edit changed. Long text has no before and after here; it is kept whole, under its own heading. */
export type FieldChange = [label: string, before?: string, after?: string]

/** The body of an edit's history entry: each short field as old → new, then each long text as it was before. */
export function editRecord(changes: FieldChange[], replaced: [heading: string, html: string][]): RichText {
  const lines = changes.filter(([, before]) => before !== undefined).map(([label, before, after]) => `<li><strong>${label}:</strong> ${escape(before!)} → ${escape(after!)}</li>`)
  return cleanRichText([lines.length ? `<ul>${lines.join('')}</ul>` : '', ...replaced.map(([heading, html]) => `<h3>${heading}</h3>${html || '<p><em>Empty</em></p>'}`)].join(''))
}

/**
 * Replace a review's details. The history entry it writes names each field that changed, as old → new, and keeps the Findings
 * and Review body as they were, so nothing written earlier is lost. The audit log names the fields only.
 */
export function updateReview(db: Db, actor: Actor, code: string, input: ReviewUpdateInput): ReviewDetail {
  const body = requireRichText(input.body, 'body', { optional: true })
  return db.transaction((tx) => {
    const was = findReviewToManage(tx, actor, code)
    if (was.version !== input.version) {
      const last = tx
        .select({ by: reviewEntries.documentedByLabel })
        .from(reviewEntries)
        .where(and(eq(reviewEntries.reviewId, was.id), eq(reviewEntries.kind, 'system'), sql`${reviewEntries.title} like ${`${EDITED}%`}`))
        .orderBy(desc(reviewEntries.seq))
        .get()
      throw conflict('stale_version', `${was.code} was edited${last ? ` by ${last.by}` : ''} while you had it open. Nothing has been saved.`, { version: was.version })
    }

    const nameOf = (id: number) => {
      const row = tx.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, id)).get()
      return row ? fullName(row.firstName, row.lastName) : ''
    }
    // Someone already named keeps their place after they are archived; only a person being named now must be here now.
    if (input.reviewerId !== was.reviewer.id) requireActiveEmployees(tx, [input.reviewerId], 'reviewerId')
    if (input.employeeId !== was.employee.id) {
      notYourself(actor, input.employeeId)
      requireActiveEmployees(tx, [input.employeeId], 'employeeId')
    }

    const changes: FieldChange[] = []
    if (input.title !== was.title) changes.push(['Title', was.title, input.title])
    if (input.summary !== was.summary) changes.push(['Summary', was.summary, input.summary])
    if (input.reviewDate !== was.reviewDate) changes.push(['Review date', formatUsDate(was.reviewDate)!, formatUsDate(input.reviewDate)!])
    if (input.reviewerId !== was.reviewer.id) changes.push(['Reviewed by', was.reviewer.name, nameOf(input.reviewerId)])
    if (input.employeeId !== was.employee.id) changes.push(['Employee reviewed', was.employee.name, nameOf(input.employeeId)])
    if (input.findings !== was.findings) changes.push(['Findings'])
    if (body.html !== was.bodyHtml) changes.push(['Review body'])
    if (changes.length === 0) throw conflict('unchanged', 'Nothing has been changed, so there is nothing to save.')

    const now = new Date()
    // The version is part of the condition, so a save that lost a race changes nothing; the check above is what explains it.
    tx.update(reviews)
      .set({
        title: input.title,
        summary: input.summary,
        findings: input.findings,
        bodyHtml: body.html,
        bodyText: body.text,
        reviewDate: input.reviewDate,
        reviewerId: input.reviewerId,
        employeeId: input.employeeId,
        version: was.version + 1,
      })
      .where(and(eq(reviews.id, was.id), eq(reviews.version, was.version)))
      .run()

    const summary = `${EDITED}${changes.map(([label]) => label).join(', ')}`
    const record = editRecord(changes, [
      ...(input.findings !== was.findings ? [['Findings before', plainToRichText(was.findings).html] as [string, string]] : []),
      ...(body.html !== was.bodyHtml ? [['Review body before', was.bodyHtml] as [string, string]] : []),
    ])
    appendReviewEntry(tx, actor, was.id, { kind: 'system', occurredAt: now, title: summary, body: record, at: now })
    writeReviewAudit(tx, actor, { action: 'update', entityType: 'review', entityId: was.id, reviewId: was.id, details: `${was.code} · ${input.title} · ${summary}`, at: now })
    return getReview(tx, actor, { id: was.id })
  })
}

interface RawRow extends Pick<RawReview, 'id' | 'code' | 'title' | 'summary' | 'reviewDate' | 'status' | 'lastActivityAt' | 'employee' | 'reviewer'> {
  capsDone: number
  capsTotal: number
  nextDue: string | null
}

/**
 * The reviews the viewer may see that match, most recent activity first. Each word of the search must be found in the ID, the
 * title, the summary, or the name of the employee reviewed or of the reviewer.
 */
export function listReviews(db: DbLike, viewer: Viewer, query: ReviewListQuery): ReviewList {
  const where: SQL[] = [reviewsVisibleTo(viewer)]
  if (query.reviewer) where.push(sql`r.reviewer_id = ${query.reviewer}`)
  if (query.employee) where.push(sql`r.employee_id = ${query.employee}`)
  if (query.from) where.push(sql`r.review_date >= ${query.from}`)
  if (query.to) where.push(sql`r.review_date <= ${query.to}`)
  for (const word of (query.q ?? '').split(/\s+/).filter(Boolean)) {
    const like = `%${word.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    const name = (alias: string) => sql`${sql.raw(alias)}.first_name || ' ' || ${sql.raw(alias)}.last_name like ${like} escape '\\'`
    where.push(sql`(r.code like ${like} escape '\\' or r.title like ${like} escape '\\' or r.summary like ${like} escape '\\' or ${name('e')} or ${name('v')})`)
  }
  const matching = db.all<RawRow>(sql`
    select r.id as id, r.code as code, r.title as title, r.summary as summary, r.review_date as reviewDate, r.status as status,
           r.last_activity_at as lastActivityAt, ${personJson('e')} as employee, ${personJson('v')} as reviewer,
           (select count(*) from review_caps c where c.review_id = r.id and c.status = 'completed') as capsDone,
           (select count(*) from review_caps c where c.review_id = r.id and c.status != 'cancelled') as capsTotal,
           (select min(c.due_date) from review_caps c where c.review_id = r.id and c.status in ('not_started', 'in_progress')) as nextDue
    from reviews r
      join employees e on e.id = r.employee_id
      join employees v on v.id = r.reviewer_id
    where ${sql.join(where, sql` and `)}
    order by r.last_activity_at desc, r.id desc`)

  const counts = Object.fromEntries([['all', matching.length], ...REVIEW_STATUSES.map((status) => [status, 0])]) as ReviewList['counts']
  for (const row of matching) counts[row.status] += 1
  const shown = query.status === 'all' ? matching : matching.filter((row) => row.status === query.status)
  const peopleIn = (column: 'reviewer_id' | 'employee_id') =>
    db
      .all<{ person: string }>(sql`
        select ${personJson('e')} as person from employees e
        where e.id in (select ${sql.raw(column)} from reviews r where ${reviewsVisibleTo(viewer)})
        order by e.last_name collate nocase, e.first_name collate nocase`)
      .map((row) => toPerson(row.person))
  return {
    counts,
    reviewers: peopleIn('reviewer_id'),
    employees: peopleIn('employee_id'),
    rows: shown.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      summary: row.summary,
      reviewDate: row.reviewDate,
      status: row.status,
      employee: toPerson(row.employee),
      reviewer: toPerson(row.reviewer),
      caps: { done: row.capsDone, total: row.capsTotal },
      nextDue: row.nextDue,
      lastActivityAt: iso(row.lastActivityAt),
    })),
  }
}
