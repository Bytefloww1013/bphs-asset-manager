import { Hono } from 'hono'
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { intParam, json, requirePermission, type Env } from '../http.ts'
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

  // Employees serve both workspaces; Archive, Restore and Delete are a Super Admin's, who sees every count.
  app.get('/', (c) => c.json(listEmployees(db).map((row) => employeeFor(c.get('user').role, row))))
  app.post('/', json(employeeCreateSchema), (c) =>
    c.json(employeeFor(c.get('user').role, createEmployee(db, c.get('user'), c.req.valid('json'))), 201),
  )
  app.patch('/:id', json(employeeUpdateSchema), (c) =>
    c.json(employeeFor(c.get('user').role, updateEmployee(db, c.get('user'), intParam(c, 'id'), c.req.valid('json')))),
  )
  app.post('/:id/archive', requirePermission('employee.archive'), (c) =>
    c.json(setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), true)),
  )
  app.post('/:id/restore', requirePermission('employee.archive'), (c) =>
    c.json(setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), false)),
  )
  app.delete('/:id', requirePermission('record.delete'), (c) => {
    deleteEmployee(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

/** Super Admin only (mounted behind requirePermission('users.manage')). */
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
