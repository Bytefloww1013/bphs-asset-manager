import { Hono } from 'hono'
import {
  assetTypeCreateSchema,
  assetTypeUpdateSchema,
  auditQuerySchema,
  ratingCreateSchema,
  ratingUpdateSchema,
} from '../../shared/schemas.ts'
import { CSV_BOM, toCsv } from '../../shared/csv.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, query, requireFull, type Env } from '../http.ts'
import {
  createAssetType,
  createDigitalAssetType,
  createRating,
  deleteAssetType,
  deleteDigitalAssetType,
  deleteRating,
  listAssetTypes,
  listDigitalAssetTypes,
  listRatings,
  updateAssetType,
  updateDigitalAssetType,
  updateRating,
} from '../services/lists.ts'
import { loadLookups } from '../services/refs.ts'
import { buildDashboard, listAudit, listAuditForExport } from '../services/reports.ts'

export function listRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/asset-types', (c) => c.json(listAssetTypes(db)))
  app.post('/asset-types', json(assetTypeCreateSchema), (c) =>
    c.json(createAssetType(db, c.get('user'), c.req.valid('json').name), 201),
  )
  app.patch('/asset-types/:id', json(assetTypeUpdateSchema), (c) =>
    c.json(updateAssetType(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.delete('/asset-types/:id', requireFull('assets'), (c) => {
    deleteAssetType(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  app.get('/digital-asset-types', (c) => c.json(listDigitalAssetTypes(db)))
  app.post('/digital-asset-types', json(assetTypeCreateSchema), (c) =>
    c.json(createDigitalAssetType(db, c.get('user'), c.req.valid('json').name), 201),
  )
  app.patch('/digital-asset-types/:id', json(assetTypeUpdateSchema), (c) =>
    c.json(updateDigitalAssetType(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.delete('/digital-asset-types/:id', requireFull('assets'), (c) => {
    deleteDigitalAssetType(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  app.get('/condition-ratings', (c) => c.json(listRatings(db)))
  app.post('/condition-ratings', json(ratingCreateSchema), (c) =>
    c.json(createRating(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.patch('/condition-ratings/:id', json(ratingUpdateSchema), (c) =>
    c.json(updateRating(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.delete('/condition-ratings/:id', requireFull('assets'), (c) => {
    deleteRating(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

export function reportRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/lookups', (c) => c.json(loadLookups(db)))
  app.get('/dashboard', (c) => c.json(buildDashboard(db)))
  app.get('/audit', query(auditQuerySchema), (c) => c.json(listAudit(db, c.req.valid('query'))))
  app.get('/audit.csv', query(auditQuerySchema), (c) => {
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
