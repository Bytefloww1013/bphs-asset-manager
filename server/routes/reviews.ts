import { Hono } from 'hono'
import type { Env } from '../http.ts'

/** The Administrative Reviews workspace. Reviews themselves come with the reviews table. */
export function reviewRoutes() {
  const app = new Hono<Env>()
  app.get('/', (c) => c.json([]))
  return app
}
