import { Hono } from 'hono'
import { muteSchema, notificationListSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, query, type Env } from '../http.ts'
import {
  addMute,
  countUnread,
  deleteMute,
  listMutes,
  listNotifications,
  markAllRead,
  readNotice,
  setArchived,
  setRead,
} from '../services/notifications.ts'

/** The signed-in account's own things. Each route reads and changes the caller's rows only, so another account's id is a 404. */
export function meRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/notifications', query(notificationListSchema), (c) => c.json(listNotifications(db, c.get('user').id, c.req.valid('query'))))
  app.get('/notifications/count', (c) => c.json({ unread: countUnread(db, c.get('user').id) }))
  app.post('/notifications/read-all', (c) => {
    markAllRead(db, c.get('user').id)
    return c.body(null, 204)
  })
  for (const [action, apply] of [
    ['read', (userId: number, id: number) => setRead(db, userId, id, true)],
    ['unread', (userId: number, id: number) => setRead(db, userId, id, false)],
    ['archive', (userId: number, id: number) => setArchived(db, userId, id, true)],
    ['unarchive', (userId: number, id: number) => setArchived(db, userId, id, false)],
  ] as const) {
    app.post(`/notifications/:id/${action}`, (c) => {
      apply(c.get('user').id, intParam(c, 'id'))
      return c.body(null, 204)
    })
  }

  app.get('/notices/:id', (c) => c.json(readNotice(db, c.get('user').id, intParam(c, 'id'))))

  app.get('/mutes', (c) => c.json(listMutes(db, c.get('user').id)))
  app.post('/mutes', json(muteSchema), (c) => c.json(addMute(db, c.get('user').id, c.req.valid('json')), 201))
  app.delete('/mutes/:id', (c) => {
    deleteMute(db, c.get('user').id, intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
