import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { open, requires, serviceDecides } from '#kernel/access/route.ts'
import type { Db } from '#kernel/db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requireFull, sendFile, upload, type Env } from '#kernel/http.ts'
import { forbidden } from '#kernel/lib/errors.ts'
import { readUploads } from '#kernel/lib/uploads.ts'
import { needsAccess } from '#shared/permissions.ts'
import { canAssignTasks } from '../shared/permissions.ts'
import {
  myTaskListQuerySchema,
  taskAttachmentWithdrawSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskSendBackSchema,
  taskUpdateSchema,
} from '../shared/schemas.ts'
import {
  approveTask,
  cancelTask,
  completeTask,
  createTasks,
  deleteTask,
  downloadTaskFile,
  getMyTask,
  getTask,
  listMyTasks,
  listTaskAccounts,
  listTasks,
  requireEditableTask,
  requireMyTask,
  sendBackTask,
  updateTask,
  withdrawTaskFile,
} from './service.ts'

/** A check run before the body is read, so a request that would be refused is refused before its files are buffered. The service checks again. */
const first =
  (check: (c: Context<Env>) => unknown): MiddlewareHandler<Env> =>
  async (c, next) => {
    check(c)
    await next()
  }

/** Employee Tasks. Read lets a request in; the service checks Assign, edit-own and the approvers. */
export function taskRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('tasks', 'read'), query(taskListQuerySchema), (c) =>
    c.json(listTasks(db, c.req.valid('query'))),
  )
  app.post(
    '/',
    serviceDecides('tasks'),
    upload(),
    first((c) => {
      if (!canAssignTasks(c.get('user'))) throw forbidden(needsAccess('tasks', 'assign'))
    }),
    jsonOrFiles(taskCreateSchema),
    async (c) =>
      c.json(createTasks(db, c.get('user'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )
  app.get('/accounts', requires('tasks', 'read'), (c) => c.json(listTaskAccounts(db, c.get('user'))))
  app.get('/:id', requires('tasks', 'read'), (c) => c.json(getTask(db, intParam(c, 'id'))))
  app.patch(
    '/:id',
    serviceDecides('tasks'),
    upload(),
    first((c) => requireEditableTask(db, c.get('user'), intParam(c, 'id'))),
    jsonOrFiles(taskUpdateSchema),
    async (c) =>
      c.json(
        updateTask(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'), await readUploads(await formFiles(c))),
      ),
  )
  app.get('/:id/attachments/:fileId', requires('tasks', 'read'), (c) =>
    sendFile(c, downloadTaskFile(db, c.get('user'), 'workspace', intParam(c, 'id'), intParam(c, 'fileId'))),
  )
  app.post('/:id/attachments/:fileId/withdraw', serviceDecides('tasks'), json(taskAttachmentWithdrawSchema), (c) => {
    withdrawTaskFile(db, c.get('user'), 'workspace', intParam(c, 'id'), intParam(c, 'fileId'), c.req.valid('json'))
    return c.json(getTask(db, intParam(c, 'id')))
  })
  app.post('/:id/cancel', serviceDecides('tasks'), (c) => c.json(cancelTask(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/approve', serviceDecides('tasks'), (c) => c.json(approveTask(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/send-back', serviceDecides('tasks'), json(taskSendBackSchema), (c) =>
    c.json(sendBackTask(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').note)),
  )
  app.delete('/:id', serviceDecides('tasks'), requireFull('tasks'), (c) => {
    deleteTask(db, intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

/** My Space › Tasks: the caller's own sent tasks, whatever their access. */
export function myTaskRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', open(), query(myTaskListQuerySchema), (c) =>
    c.json(listMyTasks(db, c.get('user').id, c.req.valid('query'))),
  )
  app.get('/:id', open(), (c) => c.json(getMyTask(db, c.get('user').id, intParam(c, 'id'))))
  app.post(
    '/:id/complete',
    open(),
    upload(),
    first((c) => requireMyTask(db, c.get('user').id, intParam(c, 'id'))),
    jsonOrFiles(taskCompleteSchema),
    async (c) =>
      c.json(
        completeTask(
          db,
          c.get('user'),
          intParam(c, 'id'),
          c.req.valid('json').note,
          await readUploads(await formFiles(c)),
        ),
      ),
  )
  // Seeing the task (it is theirs, and sent) is what lets them have its files.
  app.get('/:id/attachments/:fileId', open(), (c) =>
    sendFile(c, downloadTaskFile(db, c.get('user'), 'mine', intParam(c, 'id'), intParam(c, 'fileId'))),
  )
  app.post('/:id/attachments/:fileId/withdraw', open(), json(taskAttachmentWithdrawSchema), (c) => {
    withdrawTaskFile(db, c.get('user'), 'mine', intParam(c, 'id'), intParam(c, 'fileId'), c.req.valid('json'))
    return c.json(getMyTask(db, c.get('user').id, intParam(c, 'id')))
  })

  return app
}
