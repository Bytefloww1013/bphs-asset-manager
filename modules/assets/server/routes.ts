import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, requireFull, type Env } from '#kernel/http.ts'
import { requires } from '#kernel/access/route.ts'
import {
  assetBulkSchema,
  assetCreateSchema,
  assetUpdateSchema,
  issueSchema,
  returnBulkSchema,
  returnSchema,
} from '../shared/index.ts'
import {
  createAsset,
  createAssetsBulk,
  deleteAsset,
  getAssetDetail,
  loadAssetRows,
  setAssetStatus,
  updateAsset,
} from './service.ts'
import { issueAsset, listOpenAssignments, returnAssignment, returnMany } from './assignments.ts'
import { buildDashboard } from './dashboard.ts'
import { loadLookups } from './refs.ts'

export function assetRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('assets', 'read'), (c) => c.json(loadAssetRows(db)))
  app.post('/', requires('assets', 'edit'), json(assetCreateSchema), (c) =>
    c.json(createAsset(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.post('/bulk', requires('assets', 'edit'), json(assetBulkSchema), (c) =>
    c.json(createAssetsBulk(db, c.get('user'), c.req.valid('json'))),
  )
  app.get('/tag/:tag', requires('assets', 'read'), (c) => c.json(getAssetDetail(db, c.req.param('tag'))))
  app.patch('/:id', requires('assets', 'edit'), json(assetUpdateSchema), (c) =>
    c.json(updateAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/retire', requires('assets', 'edit'), (c) =>
    c.json(setAssetStatus(db, c.get('user'), intParam(c, 'id'), 'retired')),
  )
  app.post('/:id/reinstate', requires('assets', 'edit'), (c) =>
    c.json(setAssetStatus(db, c.get('user'), intParam(c, 'id'), 'in_service')),
  )
  app.delete('/:id', requires('assets', 'edit'), requireFull('assets'), (c) => {
    deleteAsset(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

export function assignmentRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('assets', 'read'), (c) => c.json(listOpenAssignments(db)))
  app.post('/', requires('assets', 'edit'), json(issueSchema), (c) =>
    c.json(issueAsset(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.post('/return-bulk', requires('assets', 'edit'), json(returnBulkSchema), (c) =>
    c.json(returnMany(db, c.get('user'), c.req.valid('json'))),
  )
  app.post('/:id/return', requires('assets', 'edit'), json(returnSchema), (c) => {
    returnAssignment(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))
    return c.body(null, 204)
  })

  return app
}

/** The forms' pickers and the Overview, at `/api/lookups` and `/api/dashboard`. */
export function reportRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/lookups', requires('assets', 'read'), (c) => c.json(loadLookups(db)))
  app.get('/dashboard', requires('assets', 'read'), (c) => c.json(buildDashboard(db)))

  return app
}
