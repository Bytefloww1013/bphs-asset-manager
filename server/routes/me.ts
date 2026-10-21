import { Hono } from 'hono'
import { notificationListSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, query, type Env } from '../http.ts'
import {
  countUnread,
  listNotifications,
  markAllRead,
  readNotice,
  setArchived,
  setRead,
} from '../services/notifications.ts'
import { myTaskRoutes } from './tasks.ts'

/** The signed-in account's own things. Each route reads and changes the caller's rows only, so another account's id is a 404. */
export function meRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/notifications', query(notificationListSchema), (c) =>
    c.json(listNotifications(db, c.get('user').id, c.req.valid('query'))),
  )
  app.get('/notifications/count', (c) => c.json({ unread: countUnread(db, c.get('user').id) }))
  app.post('/notifications/read-all', (c) => {
    markAllRead(db, c.get('user').id)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/read', (c) => {
    setRead(db, c.get('user').id, intParam(c, 'id'), true)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/unread', (c) => {
    setRead(db, c.get('user').id, intParam(c, 'id'), false)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/archive', (c) => {
    setArchived(db, c.get('user').id, intParam(c, 'id'), true)
    return c.body(null, 204)
  })
  app.post('/notifications/:id/unarchive', (c) => {
    setArchived(db, c.get('user').id, intParam(c, 'id'), false)
    return c.body(null, 204)
  })

  app.get('/notices/:id', (c) => c.json(readNotice(db, c.get('user').id, intParam(c, 'id'))))
  app.route('/tasks', myTaskRoutes(db))

  return app
}
