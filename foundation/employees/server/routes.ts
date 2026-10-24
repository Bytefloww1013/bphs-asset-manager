import { employeeCreateSchema, employeeUpdateSchema } from '../shared/index.ts'
import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { intParam, json, requireFull, type Env } from '#kernel/http.ts'
import { open, requires } from '#kernel/access/route.ts'
import { createEmployee, deleteEmployee, listEmployees, setEmployeeArchived, updateEmployee } from './service.ts'

export function employeeRoutes(db: Db) {
  const app = new Hono<Env>()

  // Employees serve every workspace, so anyone may list them; Archive, Restore and Delete need Full.
  app.get('/', open(), (c) => c.json(listEmployees(db, c.get('user'))))
  app.post('/', requires('employees', 'edit'), json(employeeCreateSchema), (c) =>
    c.json(createEmployee(db, c.get('user'), c.req.valid('json')), 201),
  )
  app.patch('/:id', requires('employees', 'edit'), json(employeeUpdateSchema), (c) =>
    c.json(updateEmployee(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.post('/:id/archive', requires('employees', 'edit'), requireFull('employees'), (c) =>
    c.json(setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), true)),
  )
  app.post('/:id/restore', requires('employees', 'edit'), requireFull('employees'), (c) =>
    c.json(setEmployeeArchived(db, c.get('user'), intParam(c, 'id'), false)),
  )
  app.delete('/:id', requires('employees', 'edit'), requireFull('employees'), (c) => {
    deleteEmployee(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}
