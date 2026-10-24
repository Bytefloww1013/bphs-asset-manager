import { Hono } from 'hono'
import { userCreateSchema, userUpdateSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, type Env } from '../http.ts'
import { superAdmin } from '../access/route.ts'
import { clearLock, createUser, listUsers, resetPassword, setActive, updateUser } from '../services/users.ts'

/** Super Admin only: every route declares superAdmin(). */
export function userRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', superAdmin(), (c) => c.json(listUsers(db)))
  app.post('/', superAdmin(), json(userCreateSchema), async (c) =>
    c.json(await createUser(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.patch('/:id', superAdmin(), json(userUpdateSchema), (c) =>
    c.json(updateUser(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/reset-password', superAdmin(), async (c) =>
    c.json(await resetPassword(db, c.get('user'), intParam(c, 'id'))),
  )
  app.post('/:id/clear-lock', superAdmin(), (c) => c.json(clearLock(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/deactivate', superAdmin(), (c) => c.json(setActive(db, c.get('user'), intParam(c, 'id'), false)))
  app.post('/:id/reactivate', superAdmin(), (c) => c.json(setActive(db, c.get('user'), intParam(c, 'id'), true)))

  return app
}
