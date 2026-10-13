import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import type { Env } from '../http.ts'

export function grievanceRoutes(_db: Db) {
  const app = new Hono<Env>()

  // Nothing is stored yet.
  app.get('/', (c) => c.json([]))

  return app
}
