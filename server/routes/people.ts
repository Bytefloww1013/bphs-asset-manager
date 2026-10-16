import { Hono } from 'hono'
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requireFull, type Env } from '../http.ts'
import {
  createEmployee,
  deleteEmployee,
  employeeFor,
  listEmployees,
  setEmployeeArchived,
  updateEmployee,
} from '../services/employees.ts'
import { clearLock, createUser, listUsers, resetPassword, setActive, updateUser } from '../services/users.ts'

export function employeeRoutes(db: Db) {
  const app = new Hono<Env>()

  // Employees serve every workspace, so anyone may list them; Archive, Restore and Delete need Full.
  app.get('/', (c) => c.json(listEmployees(db).map((row) => employeeFor(c.get('user'), row))))
  app.post('/', json(employeeCreateSchema), (c) =>
    c.json(employeeFor(c.get('user'), createEmployee(db, c.get('user'), c.req.valid('json'))), 201),
  )
  app.patch('/:id', json(employeeUpdateSchema), (c) =>
    c.json(employeeFor(c.get('user'), updateEmployee(db, c.get('user'), intParam(c, 'id'), c.req.valid('json')))),
  )
  app.post('/:id/archive', requireFull('employees'), (c) =>
    c.json(employeeFor(c.get('user'), setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), true))),
  )
  app.post('/:id/restore', requireFull('employees'), (c) =>
    c.json(employeeFor(c.get('user'), setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), false))),
  )
  app.delete('/:id', requireFull('employees'), (c) => {
    deleteEmployee(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

/** Super Admin only (mounted behind requireSuperAdmin). */
export function userRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', (c) => c.json(listUsers(db)))
  app.post('/', json(userCreateSchema), async (c) => c.json(await createUser(db, c.get('user'), c.req.valid('json')), 201))
  app.patch('/:id', json(userUpdateSchema), (c) => c.json(updateUser(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))))
  app.post('/:id/reset-password', async (c) => c.json(await resetPassword(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/clear-lock', (c) => c.json(clearLock(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/deactivate', (c) => c.json(setActive(db, c.get('user'), intParam(c, 'id'), false)))
  app.post('/:id/reactivate', (c) => c.json(setActive(db, c.get('user'), intParam(c, 'id'), true)))

  return app
}
