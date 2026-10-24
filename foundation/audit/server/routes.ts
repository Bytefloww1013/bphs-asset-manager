import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { query, type Env } from '#kernel/http.ts'
import { requires } from '#kernel/access/route.ts'
import { CSV_BOM, toCsv } from '#shared/csv.ts'
import { auditQuerySchema } from '../shared/index.ts'
import { listAudit, listAuditForExport } from './service.ts'

/** The Audit log and its CSV, for every Assets reader, as before the move: `/api/audit` and `/api/audit.csv`. */
export function auditRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/audit', requires('assets', 'read'), query(auditQuerySchema), (c) =>
    c.json(listAudit(db, c.req.valid('query'))),
  )
  app.get('/audit.csv', requires('assets', 'read'), query(auditQuerySchema), (c) => {
    const entries = listAuditForExport(db, c.req.valid('query'))
    const csv = toCsv(
      ['occurred_at', 'user', 'action', 'entity_type', 'entity_id', 'details'],
      entries.map((e) => [e.occurredAt, e.actor, e.action, e.entityType, e.entityId, e.details]),
    )
    return c.body(CSV_BOM + csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    })
  })

  return app
}
