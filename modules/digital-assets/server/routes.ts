import { Hono } from 'hono'
import { requires } from '#kernel/access/route.ts'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, requireFull, type Env } from '#kernel/http.ts'
import {
  digitalAssetCreateSchema,
  digitalAssetUpdateSchema,
  digitalIssueSchema,
  digitalUnassignSchema,
} from '../shared/index.ts'
import {
  createDigitalAsset,
  deleteDigitalAsset,
  getDigitalAssetDetail,
  issueDigitalAsset,
  listDigitalAssets,
  setDigitalAssetStatus,
  unassignDigitalAsset,
  updateDigitalAsset,
} from './service.ts'

/** The digital assets' API, at `/api/digital-assets`. Their types are a lookup list (`lists.ts`). */
export function digitalAssetRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('assets', 'read'), (c) => c.json(listDigitalAssets(db)))
  app.post('/', requires('assets', 'edit'), json(digitalAssetCreateSchema), (c) =>
    c.json(createDigitalAsset(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.get('/:id', requires('assets', 'read'), (c) => c.json(getDigitalAssetDetail(db, intParam(c, 'id'))))
  app.patch('/:id', requires('assets', 'edit'), json(digitalAssetUpdateSchema), (c) =>
    c.json(updateDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/issue', requires('assets', 'edit'), json(digitalIssueSchema), (c) =>
    c.json(issueDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/unassign', requires('assets', 'edit'), json(digitalUnassignSchema), (c) =>
    c.json(unassignDigitalAsset(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/deactivate', requires('assets', 'edit'), (c) =>
    c.json(setDigitalAssetStatus(db, c.get('user'), intParam(c, 'id'), 'inactive')),
  )
  app.post('/:id/reactivate', requires('assets', 'edit'), (c) =>
    c.json(setDigitalAssetStatus(db, c.get('user'), intParam(c, 'id'), 'in_service')),
  )
  app.delete('/:id', requires('assets', 'edit'), requireFull('assets'), (c) => {
    deleteDigitalAsset(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
