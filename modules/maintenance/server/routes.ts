import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, requireFull, type Env } from '#kernel/http.ts'
import { requires } from '#kernel/access/route.ts'
import {
  maintenanceCreateSchema,
  maintenanceDispatchSchema,
  maintenanceNoteSchema,
  maintenanceStatusSchema,
} from '../shared/schemas.ts'
import {
  addMaintenanceNote,
  changeMaintenanceStatus,
  deleteMaintenanceRequest,
  dispatchMaintenanceRequest,
  enterMaintenanceRequest,
  getMaintenanceRequest,
  listMaintenanceRequests,
} from './service.ts'

export function maintenanceRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('maintenance', 'read'), (c) => c.json(listMaintenanceRequests(db)))
  app.post('/', requires('maintenance', 'edit'), json(maintenanceCreateSchema), (c) =>
    c.json(enterMaintenanceRequest(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.get('/:id', requires('maintenance', 'read'), (c) => c.json(getMaintenanceRequest(db, intParam(c, 'id'))))
  app.post('/:id/dispatch', requires('maintenance', 'edit'), json(maintenanceDispatchSchema), (c) =>
    c.json(dispatchMaintenanceRequest(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').employeeId)),
  )
  app.post('/:id/status', requires('maintenance', 'edit'), json(maintenanceStatusSchema), (c) =>
    c.json(changeMaintenanceStatus(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').status)),
  )
  app.post('/:id/notes', requires('maintenance', 'edit'), json(maintenanceNoteSchema), (c) =>
    c.json(addMaintenanceNote(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').body)),
  )
  app.delete('/:id', requires('maintenance', 'edit'), requireFull('maintenance'), (c) => {
    deleteMaintenanceRequest(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
