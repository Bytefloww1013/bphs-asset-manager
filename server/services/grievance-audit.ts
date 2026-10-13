import { sql } from 'drizzle-orm'
import type { GrievanceAuditEntry, GrievanceAuditPage } from '../../shared/types.ts'
import type { GrievanceAuditQuery } from '../../shared/schemas.ts'
import type { DbLike } from '../db/client.ts'
import { ACTOR, auditWhere } from './reports.ts'

type Raw = Omit<GrievanceAuditEntry, 'occurredAt'> & { occurredAt: number }

const toEntry = (row: Raw): GrievanceAuditEntry => ({ ...row, occurredAt: new Date(row.occurredAt).toISOString() })

// The grievance or timeline entry a row describes is joined in, so the page can link to it by its ID.
const FROM = sql`from grievance_audit_log l left join users u on u.id = l.user_id
  left join grievance_entries e on l.entity_type = 'grievance_entry' and e.id = l.entity_id
  left join grievances g on g.id = case l.entity_type when 'grievance' then l.entity_id when 'grievance_entry' then e.grievance_id end`
const COLUMNS = sql`l.id as id, l.occurred_at as occurredAt, ${ACTOR} as actor, l.action as action, l.entity_type as entityType, l.entity_id as entityId, l.details as details, g.code as code, e.seq as seq`

/** The Grievance Audit Log, newest first. Read-only: nothing here or in any route changes it. */
export function listGrievanceAudit(db: DbLike, query: GrievanceAuditQuery): GrievanceAuditPage {
  const where = auditWhere(query)
  const total = db.get<{ n: number }>(sql`select count(*) as n from grievance_audit_log l left join users u on u.id = l.user_id where ${where}`)?.n ?? 0
  const entries = db.all<Raw>(sql`select ${COLUMNS} ${FROM} where ${where} order by l.occurred_at desc, l.id desc limit ${query.limit} offset ${query.offset}`).map(toEntry)
  return { total, entries }
}

export function listGrievanceAuditForExport(db: DbLike, query: Omit<GrievanceAuditQuery, 'limit' | 'offset'>): GrievanceAuditEntry[] {
  return db.all<Raw>(sql`select ${COLUMNS} ${FROM} where ${auditWhere(query)} order by l.occurred_at desc, l.id desc limit 50000`).map(toEntry)
}
