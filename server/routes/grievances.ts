import { Hono } from 'hono'
import { grievanceCategoryCreateSchema, grievanceCategoryUpdateSchema, grievanceCreateSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requirePermission, type Env } from '../http.ts'
import { createGrievance } from '../services/grievances.ts'
import { createGrievanceCategory, deleteGrievanceCategory, listGrievanceCategories, updateGrievanceCategory } from '../services/grievance-categories.ts'

export function grievanceRoutes(db: Db) {
  const app = new Hono<Env>()

  // The list is built by the browse slice.
  app.get('/', (c) => c.json([]))
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

  return app
}
