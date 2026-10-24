import { programCreateSchema, programUpdateSchema } from '../shared/index.ts'
import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, requireFull, type Env } from '#kernel/http.ts'
import { requires } from '#kernel/access/route.ts'
import { createProgram, deleteProgram, listPrograms, setProgramActive, updateProgram } from './service.ts'

export function programRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('assets', 'read'), (c) => c.json(listPrograms(db)))
  app.post('/', requires('assets', 'edit'), json(programCreateSchema), (c) =>
    c.json(createProgram(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.patch('/:id', requires('assets', 'edit'), json(programUpdateSchema), (c) =>
    c.json(updateProgram(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/deactivate', requires('assets', 'edit'), (c) =>
    c.json(setProgramActive(db, c.get('user'), intParam(c, 'id'), false)),
  )
  app.post('/:id/reactivate', requires('assets', 'edit'), (c) =>
    c.json(setProgramActive(db, c.get('user'), intParam(c, 'id'), true)),
  )
  app.delete('/:id', requires('assets', 'edit'), requireFull('assets'), (c) => {
    deleteProgram(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
