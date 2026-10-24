import { Hono } from 'hono'
import type { Db } from '../db/client.ts'
import { intParam, json, requireFull, type Env } from '../http.ts'
import { requires } from '../access/route.ts'
import { hooks } from '../registry.ts'

/** The Lookup lists framework: four routes for each list a module registers (`hooks('lists')`), with that list's access. */
export function listRoutes(db: Db) {
  const app = new Hono<Env>()

  for (const list of hooks('lists')) {
    const path = `/${list.path}`
    app.get(path, requires(list.resource, 'read'), (c) => c.json(list.list(db)))
    app.post(path, requires(list.resource, 'edit'), json(list.createSchema), (c) =>
      c.json(list.create(db, c.get('user'), c.req.valid('json')), 201),
    )
    app.patch(`${path}/:id`, requires(list.resource, 'edit'), json(list.updateSchema), (c) =>
      c.json(list.update(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
    )
    app.delete(`${path}/:id`, requires(list.resource, 'edit'), requireFull(list.resource), (c) => {
      list.remove(db, c.get('user'), intParam(c, 'id'))
      return c.body(null, 204)
    })
  }

  return app
}
