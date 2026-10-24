import { Hono } from 'hono'
import { requires, serviceDecides } from '#kernel/access/route.ts'
import type { Db } from '#kernel/db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requireFull, sendFile, upload, type Env } from '#kernel/http.ts'
import { readUploads } from '#kernel/lib/uploads.ts'
import { CSV_BOM, toCsv } from '#shared/csv.ts'
import {
  grievanceAttachmentWithdrawSchema,
  grievanceCategoryCreateSchema,
  grievanceCategoryUpdateSchema,
  grievanceCreateSchema,
  grievanceAuditQuerySchema,
  grievanceEntryCreateSchema,
  grievanceExportSchema,
  grievanceListQuerySchema,
  grievanceOwnerChangeSchema,
  grievanceStatusChangeSchema,
  grievanceUpdateSchema,
  grievanceVoidSchema,
} from '../shared/schemas.ts'
import { listGrievanceAudit, listGrievanceAuditForExport } from './audit.ts'
import {
  createGrievanceCategory,
  deleteGrievanceCategory,
  listGrievanceCategories,
  updateGrievanceCategory,
} from './categories.ts'
import {
  addGrievanceAttachments,
  createGrievanceEntry,
  downloadGrievanceAttachment,
  listGrievanceAttachments,
  listGrievanceEntries,
  withdrawGrievanceAttachment,
} from './entries.ts'
import {
  changeGrievanceOwner,
  changeGrievanceStatus,
  createGrievance,
  getGrievance,
  listGrievanceAccountHolders,
  listGrievances,
  recordGrievanceExport,
  voidGrievance,
} from './service.ts'
import { listGrievanceVersions, updateGrievance } from './versions.ts'

export function grievanceRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('grievances', 'read'), query(grievanceListQuerySchema), (c) =>
    c.json(listGrievances(db, c.req.valid('query'))),
  )
  // Either route can take files with it, as multipart; so can the one that adds files on their own.
  app.post('/', requires('grievances', 'edit'), upload(), jsonOrFiles(grievanceCreateSchema), async (c) =>
    c.json(createGrievance(db, c.get('user'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )

  app.get('/categories', requires('grievances', 'read'), (c) => c.json(listGrievanceCategories(db)))
  app.post('/categories', requires('grievances', 'edit'), json(grievanceCategoryCreateSchema), (c) =>
    c.json(createGrievanceCategory(db, c.get('user'), c.req.valid('json').name), 201),
  )
  app.patch('/categories/:id', requires('grievances', 'edit'), json(grievanceCategoryUpdateSchema), (c) =>
    c.json(updateGrievanceCategory(db, c.get('user'), intParam(c, 'id'), c.req.valid('json'))),
  )
  app.delete('/categories/:id', requires('grievances', 'edit'), requireFull('grievances'), (c) => {
    deleteGrievanceCategory(db, c.get('user'), intParam(c, 'id'))
    return c.body(null, 204)
  })

  app.get('/account-holders', requires('grievances', 'read'), (c) => c.json(listGrievanceAccountHolders(db)))

  // Read-only for everyone, as the Audit Log is. No route writes to it; the changes it describes do.
  app.get('/audit', requires('grievances', 'read'), query(grievanceAuditQuerySchema), (c) =>
    c.json(listGrievanceAudit(db, c.req.valid('query'))),
  )
  app.get('/audit.csv', requires('grievances', 'read'), query(grievanceAuditQuerySchema), (c) => {
    const entries = listGrievanceAuditForExport(db, c.req.valid('query'))
    const csv = toCsv(
      ['occurred_at', 'user', 'action', 'entity_type', 'entity_id', 'details'],
      entries.map((e) => [e.occurredAt, e.actor, e.action, e.entityType, e.entityId, e.details]),
    )
    return c.body(CSV_BOM + csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="grievance-audit-log.csv"',
    })
  })

  // Last, so that no fixed path above is taken for a Grievance ID.
  app.get('/:code', requires('grievances', 'read'), (c) => c.json(getGrievance(db, { code: c.req.param('code') })))
  // An edit keeps what the grievance said before as a version. A version can be read; no route changes or removes one.
  app.patch('/:code', serviceDecides('grievances'), json(grievanceUpdateSchema), (c) =>
    c.json(updateGrievance(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  app.get('/:code/versions', requires('grievances', 'read'), (c) =>
    c.json(listGrievanceVersions(db, c.req.param('code'))),
  )
  // Who may make these three is decided in the service, where the grievance's owner is known. Voiding needs the permission as well.
  app.post('/:code/status', serviceDecides('grievances'), json(grievanceStatusChangeSchema), (c) =>
    c.json(changeGrievanceStatus(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  app.post('/:code/owner', serviceDecides('grievances'), json(grievanceOwnerChangeSchema), (c) =>
    c.json(changeGrievanceOwner(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  app.post('/:code/void', requires('grievances', 'edit'), requireFull('grievances'), json(grievanceVoidSchema), (c) =>
    c.json(voidGrievance(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  // The case file is printed by the browser; the page reports it here so the copy is logged.
  app.post('/:code/exports', serviceDecides('grievances'), json(grievanceExportSchema), (c) => {
    recordGrievanceExport(db, c.get('user'), c.req.param('code'), c.req.valid('json'))
    return c.body(null, 204)
  })
  // An entry can be read and added. No route changes or removes one.
  app.get('/:code/entries', requires('grievances', 'read'), (c) =>
    c.json(listGrievanceEntries(db, c.req.param('code'))),
  )
  app.post(
    '/:code/entries',
    requires('grievances', 'edit'),
    upload(),
    jsonOrFiles(grievanceEntryCreateSchema),
    async (c) =>
      c.json(
        createGrievanceEntry(
          db,
          c.get('user'),
          c.req.param('code'),
          c.req.valid('json'),
          await readUploads(await formFiles(c)),
        ),
        201,
      ),
  )
  // A file is added and never changed; taking one back is a withdrawal, not a delete.
  app.post('/:code/attachments', requires('grievances', 'edit'), upload(), async (c) =>
    c.json(addGrievanceAttachments(db, c.get('user'), c.req.param('code'), await readUploads(await formFiles(c))), 201),
  )
  app.get('/:code/attachments', requires('grievances', 'read'), (c) =>
    c.json(listGrievanceAttachments(db, c.req.param('code'))),
  )
  app.get('/:code/attachments/:id', requires('grievances', 'read'), (c) =>
    sendFile(c, downloadGrievanceAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'))),
  )
  app.post(
    '/:code/attachments/:id/withdraw',
    requires('grievances', 'edit'),
    requireFull('grievances'),
    json(grievanceAttachmentWithdrawSchema),
    (c) =>
      c.json(
        withdrawGrievanceAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'), c.req.valid('json')),
      ),
  )

  return app
}
