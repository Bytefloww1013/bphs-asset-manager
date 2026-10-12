import { sql } from 'drizzle-orm'
import { OVERDUE_DAYS, RATING_ATTENTION_BELOW, RATING_SCORE_MAX } from '../../shared/constants.ts'
import type { AuditEntry, AuditPage, DashboardData } from '../../shared/types.ts'
import type { AuditQuery } from '../../shared/schemas.ts'
import type { DbLike } from '../db/client.ts'
import { conditionRatings } from '../db/schema.ts'
import { listOpenAssignments } from './assignments.ts'
import { loadAssetRows } from './assets.ts'

interface AuditRaw {
  id: number
  occurredAt: number
  actor: string
  action: AuditEntry['action']
  entityType: string
  entityId: number | null
  details: string
}

const toEntry = (row: AuditRaw): AuditEntry => ({ ...row, occurredAt: new Date(row.occurredAt).toISOString() })

function auditWhere(query: Omit<AuditQuery, 'limit' | 'offset'>) {
  const parts = [sql`1 = 1`]
  if (query.action) parts.push(sql`action = ${query.action}`)
  if (query.from) parts.push(sql`occurred_at >= ${Date.parse(query.from)}`)
  if (query.to) parts.push(sql`occurred_at < ${Date.parse(query.to)}`)
  if (query.q) {
    const like = `%${query.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    parts.push(sql`(details like ${like} escape '\\' or actor like ${like} escape '\\' or entity_type like ${like} escape '\\')`)
  }
  return sql.join(parts, sql` and `)
}

export function listAudit(db: DbLike, query: AuditQuery): AuditPage {
  const where = auditWhere(query)
  const total = db.get<{ n: number }>(sql`select count(*) as n from audit_log where ${where}`)?.n ?? 0
  const entries = db
    .all<AuditRaw>(sql`
      select id, occurred_at as occurredAt, actor, action, entity_type as entityType, entity_id as entityId, details
      from audit_log where ${where}
      order by occurred_at desc, id desc limit ${query.limit} offset ${query.offset}`)
    .map(toEntry)
  return { total, entries }
}

export function listAuditForExport(db: DbLike, query: Omit<AuditQuery, 'limit' | 'offset'>): AuditEntry[] {
  return db
    .all<AuditRaw>(sql`
      select id, occurred_at as occurredAt, actor, action, entity_type as entityType, entity_id as entityId, details
      from audit_log where ${auditWhere(query)}
      order by occurred_at desc, id desc limit 50000`)
    .map(toEntry)
}

export function buildDashboard(db: DbLike): DashboardData {
  const rows = loadAssetRows(db)
  const open = listOpenAssignments(db)

  const totals = {
    total: rows.length,
    assigned: rows.filter((row) => row.state === 'assigned').length,
    inStorage: rows.filter((row) => row.state === 'in_storage').length,
    retired: rows.filter((row) => row.state === 'retired').length,
  }

  const types = new Map<number, { typeId: number; type: string; total: number; free: number }>()
  for (const row of rows) {
    if (row.state === 'retired') continue
    const entry = types.get(row.typeId) ?? { typeId: row.typeId, type: row.type, total: 0, free: 0 }
    entry.total += 1
    if (row.state === 'in_storage') entry.free += 1
    types.set(row.typeId, entry)
  }

  const holders = new Map<number, DashboardData['topHolders'][number]>()
  for (const assignment of open) {
    const entry = holders.get(assignment.employee.id) ?? { employee: assignment.employee, count: 0 }
    entry.count += 1
    holders.set(assignment.employee.id, entry)
  }

  const scores = new Map(db.select({ id: conditionRatings.id, score: conditionRatings.score }).from(conditionRatings).all().map((r) => [r.id, r.score]))

  const recent = db
    .all<AuditRaw>(sql`
      select id, occurred_at as occurredAt, actor, action, entity_type as entityType, entity_id as entityId, details
      from audit_log order by occurred_at desc, id desc limit 8`)
    .map(toEntry)

  return {
    totals,
    byType: [...types.values()].sort((a, b) => b.total - a.total),
    overdueCount: open.filter((a) => a.daysOut > OVERDUE_DAYS).length,
    longestOut: open.slice(0, 6).map((a) => ({
      assignmentId: a.id,
      assetTag: a.assetTag,
      assetType: a.assetType,
      employee: a.employee,
      daysOut: a.daysOut,
    })),
    topHolders: [...holders.values()].sort((a, b) => b.count - a.count || a.employee.name.localeCompare(b.employee.name)).slice(0, 5),
    poorCondition: rows
      .filter((row) => row.state !== 'retired' && row.condition && (scores.get(row.condition.ratingId) ?? RATING_SCORE_MAX) < RATING_ATTENTION_BELOW)
      .slice(0, 6)
      .map((row) => ({
        assetId: row.id,
        assetTag: row.tag,
        assetType: row.type,
        rating: row.condition!.rating,
        holder: row.holder ? row.holder.name : null,
      })),
    recent,
  }
}

