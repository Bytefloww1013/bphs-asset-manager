import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, query, type Env } from '#kernel/http.ts'
import { open, superAdmin } from '#kernel/access/route.ts'
import { noticeSchema, notificationListSchema } from '../shared/index.ts'
import {
  countUnread,
  listNotices,
  listNotifications,
  markAllRead,
  readNotice,
  sendNotice,
  setArchived,
  setRead,
} from './service.ts'

/** The signed-in account's Inbox. Each route reads and changes the caller's rows only, so another account's id is a 404. */
export function inboxRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/notifications', open(), query(notificationListSchema), (c) =>
    c.json(listNotifications(db, c.get('user').id, c.req.valid('query'))),
  )
  app.get('/notifications/count', open(), (c) => c.json({ unread: countUnread(db, c.get('user').id) }))
  app.post('/notifications/read-all', open(), (c) => {
    markAllRead(db, c.get('user').id)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/read', open(), (c) => {
    setRead(db, c.get('user').id, intParam(c, 'id'), true)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/unread', open(), (c) => {
    setRead(db, c.get('user').id, intParam(c, 'id'), false)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/archive', open(), (c) => {
    setArchived(db, c.get('user').id, intParam(c, 'id'), true)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/unarchive', open(), (c) => {
    setArchived(db, c.get('user').id, intParam(c, 'id'), false)
    return c.body(null, 204)
  })

  app.get('/notices/:id', open(), (c) => c.json(readNotice(db, c.get('user').id, intParam(c, 'id'))))

  return app
}

/** Sending notices and seeing who has read them: Super Admins only. A recipient reads one at GET /api/me/notices/:id. */
export function noticeRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', superAdmin(), (c) => c.json(listNotices(db)))
  app.post('/', superAdmin(), json(noticeSchema), (c) =>
    c.json(sendNotice(db, c.get('user'), c.req.valid('json')), 201),
  )

  return app
}
