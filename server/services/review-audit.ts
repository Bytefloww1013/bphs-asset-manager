import { sql } from 'drizzle-orm'
import type { ReviewAuditEntry, ReviewAuditPage } from '../../shared/types.ts'
import type { ReviewAuditQuery } from '../../shared/schemas.ts'
import type { DbLike } from '../db/client.ts'
import { ACTOR, auditWhere } from './reports.ts'
import { reviewsVisibleTo } from './reviews.ts'

type Raw = Omit<ReviewAuditEntry, 'occurredAt'> & { occurredAt: number }

const toEntry = (row: Raw): ReviewAuditEntry => ({ ...row, occurredAt: new Date(row.occurredAt).toISOString() })

// The review and CAP a row describes are joined in, so the page can link to them by their IDs; a file on a CAP links to its CAP.
const FROM = sql`from review_audit_log l left join users u on u.id = l.user_id
  left join reviews r on r.id = l.review_id
  left join review_attachments a on l.entity_type = 'attachment' and a.id = l.entity_id
  left join review_caps c on c.id = case l.entity_type when 'cap' then l.entity_id when 'attachment' then a.cap_id end`
const COLUMNS = sql`l.id as id, l.occurred_at as occurredAt, ${ACTOR} as actor, l.action as action, l.entity_type as entityType, l.entity_id as entityId, l.details as details, r.code as code, c.seq as cap`

/** The filters, and nothing about a review of the viewer's own employee: even its ID and title are not theirs to see. */
const where = (viewer: { employeeId: number | null }, query: Omit<ReviewAuditQuery, 'limit' | 'offset'>) =>
  sql`${auditWhere(query)} and (l.review_id is null or ${reviewsVisibleTo(viewer)})`

/** The Review Audit Log, newest first. Read-only: nothing here or in any route changes it. */
export function listReviewAudit(db: DbLike, viewer: { employeeId: number | null }, query: ReviewAuditQuery): ReviewAuditPage {
  const seen = where(viewer, query)
  const total = db.get<{ n: number }>(sql`select count(*) as n ${FROM} where ${seen}`)?.n ?? 0
  const entries = db.all<Raw>(sql`select ${COLUMNS} ${FROM} where ${seen} order by l.occurred_at desc, l.id desc limit ${query.limit} offset ${query.offset}`).map(toEntry)
  return { total, entries }
}

export function listReviewAuditForExport(db: DbLike, viewer: { employeeId: number | null }, query: Omit<ReviewAuditQuery, 'limit' | 'offset'>): ReviewAuditEntry[] {
  return db.all<Raw>(sql`select ${COLUMNS} ${FROM} where ${where(viewer, query)} order by l.occurred_at desc, l.id desc limit 50000`).map(toEntry)
}
