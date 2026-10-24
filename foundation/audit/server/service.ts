import { sql } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { auditEntityTypes, type AuditEntityType } from '#shared/registry.ts'
import type { AuditAction } from '../shared/constants.ts'
import type { AuditQuery } from '../shared/schemas.ts'
import type { AuditEntry, AuditPage } from '../shared/types.ts'
import { auditLog } from './schema.ts'

export interface AuditInput {
  action: AuditAction
  /** One some module's manifest declares (`auditEntityTypes()`). */
  entityType: AuditEntityType
  entityId: number | null
  details?: string
  at?: Date
}

/** Append one entry. Call inside the same transaction as the change it describes. */
export function writeAudit(db: DbLike, actor: Actor, entry: AuditInput) {
  if (!auditEntityTypes().includes(entry.entityType))
    throw new Error(`No module declares the audit entity type ${entry.entityType}`)
  db.insert(auditLog)
    .values({
      occurredAt: entry.at ?? new Date(),
      userId: actor.id,
      actor: actor.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details ?? '',
    })
    .run()
}

// ---- The Audit log ------------------------------------------------------------------

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

/**
 * Who an entry is shown as acting. Entries record the actor's email. Older ones recorded only the part before the @, which two
 * accounts can share, and the log cannot be rewritten; those are read with the email of the account they point to.
 */
export const ACTOR = sql`case when instr(l.actor, '@') = 0 and u.email is not null then u.email else l.actor end`
const AUDIT_FROM = sql`from audit_log l left join users u on u.id = l.user_id`
const AUDIT_COLUMNS = sql`l.id as id, l.occurred_at as occurredAt, ${ACTOR} as actor, l.action as action, l.entity_type as entityType, l.entity_id as entityId, l.details as details`

/** The filters both audit logs take. Reads the log as `l` and its account as `u`. */
export function auditWhere(query: Omit<AuditQuery, 'limit' | 'offset' | 'action'> & { action?: string }) {
  const parts = [sql`1 = 1`]
  if (query.action) parts.push(sql`l.action = ${query.action}`)
  if (query.from) parts.push(sql`l.occurred_at >= ${Date.parse(query.from)}`)
  if (query.to) parts.push(sql`l.occurred_at < ${Date.parse(query.to)}`)
  if (query.q) {
    const like = `%${query.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    parts.push(
      sql`(l.details like ${like} escape '\\' or ${ACTOR} like ${like} escape '\\' or l.entity_type like ${like} escape '\\')`,
    )
  }
  return sql.join(parts, sql` and `)
}

export function listAudit(db: DbLike, query: AuditQuery): AuditPage {
  const where = auditWhere(query)
  const total = db.get<{ n: number }>(sql`select count(*) as n ${AUDIT_FROM} where ${where}`)?.n ?? 0
  const entries = db
    .all<AuditRaw>(
      sql`select ${AUDIT_COLUMNS} ${AUDIT_FROM} where ${where} order by l.occurred_at desc, l.id desc limit ${query.limit} offset ${query.offset}`,
    )
    .map(toEntry)
  return { total, entries }
}

/** The newest entries, as the dashboard lists them. */
export function latestAudit(db: DbLike, limit: number): AuditEntry[] {
  return db
    .all<AuditRaw>(sql`select ${AUDIT_COLUMNS} ${AUDIT_FROM} order by l.occurred_at desc, l.id desc limit ${limit}`)
    .map(toEntry)
}

export function listAuditForExport(db: DbLike, query: Omit<AuditQuery, 'limit' | 'offset'>): AuditEntry[] {
  return db
    .all<AuditRaw>(
      sql`select ${AUDIT_COLUMNS} ${AUDIT_FROM} where ${auditWhere(query)} order by l.occurred_at desc, l.id desc limit 50000`,
    )
    .map(toEntry)
}
