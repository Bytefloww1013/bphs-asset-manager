import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { canAssignTasks, needsAccess } from '../../shared/permissions.ts'
import {
  myTaskListQuerySchema,
  taskAttachmentWithdrawSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskSendBackSchema,
  taskUpdateSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requireFull, sendFile, type Env } from '../http.ts'
import { forbidden } from '../lib/errors.ts'
import { readUploads } from '../lib/uploads.ts'
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
} from '../services/tasks.ts'

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

  app.get('/', query(taskListQuerySchema), (c) => c.json(listTasks(db, c.req.valid('query'))))
  app.post(
    '/',
    first((c) => {
      if (!canAssignTasks(c.get('user'))) throw forbidden(needsAccess('tasks', 'assign'))
    }),
    jsonOrFiles(taskCreateSchema),
    async (c) =>
      c.json(createTasks(db, c.get('user'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )
  app.get('/accounts', (c) => c.json(listTaskAccounts(db, c.get('user'))))
  app.get('/:id', (c) => c.json(getTask(db, intParam(c, 'id'))))
  app.patch(
    '/:id',
    first((c) => requireEditableTask(db, c.get('user'), intParam(c, 'id'))),
    jsonOrFiles(taskUpdateSchema),
    async (c) =>
      c.json(
        updateTask(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'), await readUploads(await formFiles(c))),
      ),
  )
  app.get('/:id/attachments/:fileId', (c) =>
    sendFile(c, downloadTaskFile(db, c.get('user'), 'workspace', intParam(c, 'id'), intParam(c, 'fileId'))),
  )
  app.post('/:id/attachments/:fileId/withdraw', json(taskAttachmentWithdrawSchema), (c) => {
    withdrawTaskFile(db, c.get('user'), 'workspace', intParam(c, 'id'), intParam(c, 'fileId'), c.req.valid('json'))
    return c.json(getTask(db, intParam(c, 'id')))
  })
  app.post('/:id/cancel', (c) => c.json(cancelTask(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/approve', (c) => c.json(approveTask(db, c.get('user'), intParam(c, 'id'))))
  app.post('/:id/send-back', json(taskSendBackSchema), (c) =>
    c.json(sendBackTask(db, c.get('user'), intParam(c, 'id'), c.req.valid('json').note)),
  )
  app.delete('/:id', requireFull('tasks'), (c) => {
    deleteTask(db, intParam(c, 'id'))
    return c.body(null, 204)
  })

  return app
}

/** My Space › Tasks: the caller's own sent tasks, whatever their access. */
export function myTaskRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', query(myTaskListQuerySchema), (c) => c.json(listMyTasks(db, c.get('user').id, c.req.valid('query'))))
  app.get('/:id', (c) => c.json(getMyTask(db, c.get('user').id, intParam(c, 'id'))))
  app.post(
    '/:id/complete',
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
  app.get('/:id/attachments/:fileId', (c) =>
    sendFile(c, downloadTaskFile(db, c.get('user'), 'mine', intParam(c, 'id'), intParam(c, 'fileId'))),
  )
  app.post('/:id/attachments/:fileId/withdraw', json(taskAttachmentWithdrawSchema), (c) => {
    withdrawTaskFile(db, c.get('user'), 'mine', intParam(c, 'id'), intParam(c, 'fileId'), c.req.valid('json'))
    return c.json(getMyTask(db, c.get('user').id, intParam(c, 'id')))
  })

  return app
}
