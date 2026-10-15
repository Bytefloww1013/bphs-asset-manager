import { Hono } from 'hono'
import { maintenanceCreateSchema, maintenanceDispatchSchema, maintenanceNoteSchema, maintenanceStatusSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requirePermission, type Env } from '../http.ts'
import {
  addMaintenanceNote,
  changeMaintenanceStatus,
  deleteMaintenanceRequest,
  dispatchMaintenanceRequest,
  enterMaintenanceRequest,
  getMaintenanceRequest,
  listMaintenanceRequests,
} from '../services/maintenance.ts'

export function maintenanceRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listMaintenanceRequests(db)))
  app.post('/', json(maintenanceCreateSchema), (c) => c.json(enterMaintenanceRequest(db, c.get('user'), c.req.valid('json')), 201))
  app.get('/:id', (c) => c.json(getMaintenanceRequest(db, intParam(c, 'id'))))
  app.post('/:id/dispatch', json(maintenanceDispatchSchema), (c) =>
    c.json(dispatchMaintenanceRequest(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').employeeId)),
  )
  app.post('/:id/status', json(maintenanceStatusSchema), (c) => c.json(changeMaintenanceStatus(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').status)))
  app.post('/:id/notes', json(maintenanceNoteSchema), (c) => c.json(addMaintenanceNote(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').body)))
  app.delete('/:id', requirePermission('record.delete'), (c) => {
    deleteMaintenanceRequest(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
