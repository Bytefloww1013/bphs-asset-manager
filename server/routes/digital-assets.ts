import { Hono } from 'hono'
import {
  digitalAssetCreateSchema,
  digitalAssetUpdateSchema,
  digitalIssueSchema,
  digitalUnassignSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requireFull, type Env } from '../http.ts'
import {
  createDigitalAsset,
  deleteDigitalAsset,
  getDigitalAssetDetail,
  issueDigitalAsset,
  listDigitalAssets,
  setDigitalAssetStatus,
  unassignDigitalAsset,
  updateDigitalAsset,
} from '../services/digital-assets.ts'

export function digitalAssetRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listDigitalAssets(db)))
  app.post('/', json(digitalAssetCreateSchema), (c) =>
    c.json(createDigitalAsset(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.get('/:id', (c) => c.json(getDigitalAssetDetail(db, intParam(c, 'id'))))
  app.patch('/:id', json(digitalAssetUpdateSchema), (c) =>
    c.json(updateDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/issue', json(digitalIssueSchema), (c) =>
    c.json(issueDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/unassign', json(digitalUnassignSchema), (c) =>
    c.json(unassignDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/deactivate', (c) => c.json(setDigitalAssetStatus(db, c.get('user'), intParam(c, 'id'), 'inactive')))
  app.post('/:id/reactivate', (c) => c.json(setDigitalAssetStatus(db, c.get('user'), intParam(c, 'id'), 'in_service')))
  app.delete('/:id', requireFull('assets'), (c) => {
    deleteDigitalAsset(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
