import { Hono } from 'hono'
import { programCreateSchema, programUpdateSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requirePermission, type Env } from '../http.ts'
import { createProgram, deleteProgram, listPrograms, setProgramActive, updateProgram } from '../services/programs.ts'

export function programRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listPrograms(db)))
  app.post('/', json(programCreateSchema), (c) => c.json(createProgram(db, c.get('user'), c.req.valid('json')), 201))
  app.patch('/:id', json(programUpdateSchema), (c) =>
    c.json(updateProgram(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/deactivate', (c) => c.json(setProgramActive(db, c.get('user'), intParam(c, 'id'), false)))
  app.post('/:id/reactivate', (c) => c.json(setProgramActive(db, c.get('user'), intParam(c, 'id'), true)))
  app.delete('/:id', requirePermission('record.delete'), (c) => {
    deleteProgram(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
