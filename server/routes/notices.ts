import { Hono } from 'hono'
import { noticeSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, type Env } from '../http.ts'
import { listNotices, sendNotice } from '../services/notifications.ts'

/** Sending notices and seeing who has read them: Super Admins only, checked in app.ts. A recipient reads one at GET /api/me/notices/:id. */
export function noticeRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listNotices(db)))
  app.post('/', json(noticeSchema), (c) => c.json(sendNotice(db, c.get('user'), c.req.valid('json')), 201))

  return app
}
