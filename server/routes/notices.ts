import { Hono } from 'hono'
import { canSendNotices } from '../../shared/permissions.ts'
import { noticeSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, type Env } from '../http.ts'
import { forbidden } from '../lib/errors.ts'
import { listNotices, sendNotice } from '../services/notifications.ts'

/** Sending notices and seeing who has read them: `canSendNotices` only. A recipient reads one at GET /api/me/notices/:id. */
export function noticeRoutes(db: Db) {
  const app = new Hono<Env>()

  app.use('*', async (c, next) => {
    if (!canSendNotices(c.get('user'))) throw forbidden('Only a Super Admin can send notices.')
    await next()
  })
  app.get('/', (c) => c.json(listNotices(db)))
  app.post('/', json(noticeSchema), (c) => c.json(sendNotice(db, c.get('user'), c.req.valid('json')), 201))

  return app
}
