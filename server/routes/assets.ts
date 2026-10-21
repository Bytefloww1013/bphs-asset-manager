import { Hono } from 'hono'
import {
  assetBulkSchema,
  assetCreateSchema,
  assetUpdateSchema,
  issueSchema,
  returnBulkSchema,
  returnSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requireFull, type Env } from '../http.ts'
import {
  createAsset,
  createAssetsBulk,
  deleteAsset,
  getAssetDetail,
  loadAssetRows,
  setAssetStatus,
  updateAsset,
} from '../services/assets.ts'
import { issueAsset, listOpenAssignments, returnAssignment, returnMany } from '../services/assignments.ts'

export function assetRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(loadAssetRows(db)))
  app.post('/', json(assetCreateSchema), (c) => c.json(createAsset(db, c.get('user'), c.req.valid('json')), 201))
  app.post('/bulk', json(assetBulkSchema), (c) => c.json(createAssetsBulk(db, c.get('user'), c.req.valid('json'))))
  app.get('/tag/:tag', (c) => c.json(getAssetDetail(db, c.req.param('tag'))))
  app.patch('/:id', json(assetUpdateSchema), (c) =>
    c.json(updateAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/retire', (c) => c.json(setAssetStatus(db, c.get('user'), intParam(c, 'id'), 'retired')))
  app.post('/:id/reinstate', (c) => c.json(setAssetStatus(db, c.get('user'), intParam(c, 'id'), 'in_service')))
  app.delete('/:id', requireFull('assets'), (c) => {
    deleteAsset(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

export function assignmentRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listOpenAssignments(db)))
  app.post('/', json(issueSchema), (c) => c.json(issueAsset(db, c.get('user'), c.req.valid('json')), 201))
  app.post('/return-bulk', json(returnBulkSchema), (c) => c.json(returnMany(db, c.get('user'), c.req.valid('json'))))
  app.post('/:id/return', json(returnSchema), (c) => {
    returnAssignment(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))
    return c.body(null, 204)
  })

  return app
}
