import { Hono } from 'hono'
import { grievanceCategoryCreateSchema, grievanceCategoryUpdateSchema, grievanceCreateSchema, grievanceEntryCreateSchema, grievanceListQuerySchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, query, requirePermission, type Env } from '../http.ts'
import { createGrievance, getGrievance, listGrievances } from '../services/grievances.ts'
import { createGrievanceEntry } from '../services/grievance-entries.ts'
import { createGrievanceCategory, deleteGrievanceCategory, listGrievanceCategories, updateGrievanceCategory } from '../services/grievance-categories.ts'

export function grievanceRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', query(grievanceListQuerySchema), (c) => c.json(listGrievances(db, c.req.valid('query'))))
  app.post('/', json(grievanceCreateSchema), (c) => c.json(createGrievance(db, c.get('user'), c.req.valid('json')), 201))

  app.get('/categories', (c) => c.json(listGrievanceCategories(db)))
  app.post('/categories', json(grievanceCategoryCreateSchema), (c) =>
    c.json(createGrievanceCategory(db, c.get('user'), c.req.valid('json').name), 201),
  )
  app.patch('/categories/:id', json(grievanceCategoryUpdateSchema), (c) =>
    c.json(updateGrievanceCategory(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.delete('/categories/:id', requirePermission('record.delete'), (c) => {
    deleteGrievanceCategory(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  // Last, so that no fixed path above is taken for a Grievance ID.
  app.get('/:code', (c) => c.json(getGrievance(db, { code: c.req.param('code') })))
  // An entry can be added. No route changes or removes one.
  app.post('/:code/entries', json(grievanceEntryCreateSchema), (c) => c.json(createGrievanceEntry(db, c.get('user'), c.req.param('code'), c.req.valid('json')), 201))

  return app
}
