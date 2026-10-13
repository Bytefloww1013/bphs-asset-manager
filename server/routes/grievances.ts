import { Hono } from 'hono'
import {
  grievanceAttachmentWithdrawSchema,
  grievanceCategoryCreateSchema,
  grievanceCategoryUpdateSchema,
  grievanceCreateSchema,
  grievanceAuditQuerySchema,
  grievanceEntryCreateSchema,
  grievanceListQuerySchema,
  grievanceOwnerChangeSchema,
  grievanceStatusChangeSchema,
  grievanceUpdateSchema,
  grievanceVoidSchema,
} from '../../shared/schemas.ts'
import { CSV_BOM, toCsv } from '../../shared/csv.ts'
import type { Db } from '../db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requirePermission, type Env } from '../http.ts'
import { changeGrievanceOwner, changeGrievanceStatus, createGrievance, getGrievance, listGrievanceAccountHolders, listGrievances, voidGrievance } from '../services/grievances.ts'
import {
  addGrievanceAttachments,
  createGrievanceEntry,
  downloadGrievanceAttachment,
  listGrievanceAttachments,
  listGrievanceEntries,
  withdrawGrievanceAttachment,
} from '../services/grievance-entries.ts'
import { readUploads } from '../services/grievance-attachments.ts'
import { listGrievanceVersions, updateGrievance } from '../services/grievance-versions.ts'
import { listGrievanceAudit, listGrievanceAuditForExport } from '../services/grievance-audit.ts'
import { createGrievanceCategory, deleteGrievanceCategory, listGrievanceCategories, updateGrievanceCategory } from '../services/grievance-categories.ts'

/** Save as, under the file's own name: plain ASCII for old browsers, the exact name (RFC 5987) for the rest. */
const contentDisposition = (filename: string) =>
  `attachment; filename="${filename.replace(/[^ -~]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}`

export function grievanceRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', query(grievanceListQuerySchema), (c) => c.json(listGrievances(db, c.req.valid('query'))))
  // Either route can take files with it, as multipart; so can the one that adds files on their own.
  app.post('/', jsonOrFiles(grievanceCreateSchema), async (c) => c.json(createGrievance(db, c.get('user'), c.req.valid('json'), await readUploads(await formFiles(c))), 201))

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

  app.get('/account-holders', (c) => c.json(listGrievanceAccountHolders(db)))

  // Read-only for everyone, as the Audit Log is. No route writes to it; the changes it describes do.
  app.get('/audit', query(grievanceAuditQuerySchema), (c) => c.json(listGrievanceAudit(db, c.req.valid('query'))))
  app.get('/audit.csv', query(grievanceAuditQuerySchema), (c) => {
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
  app.get('/:code', (c) => c.json(getGrievance(db, { code: c.req.param('code') })))
  // An edit keeps what the grievance said before as a version. A version can be read; no route changes or removes one.
  app.patch('/:code', json(grievanceUpdateSchema), (c) => c.json(updateGrievance(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))
  app.get('/:code/versions', (c) => c.json(listGrievanceVersions(db, c.req.param('code'))))
  // Who may make these three is decided in the service, where the grievance's owner is known. Voiding needs the permission as well.
  app.post('/:code/status', json(grievanceStatusChangeSchema), (c) => c.json(changeGrievanceStatus(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))
  app.post('/:code/owner', json(grievanceOwnerChangeSchema), (c) => c.json(changeGrievanceOwner(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))
  app.post('/:code/void', requirePermission('grievance.void'), json(grievanceVoidSchema), (c) =>
    c.json(voidGrievance(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  // An entry can be read and added. No route changes or removes one.
  app.get('/:code/entries', (c) => c.json(listGrievanceEntries(db, c.req.param('code'))))
  app.post('/:code/entries', jsonOrFiles(grievanceEntryCreateSchema), async (c) =>
    c.json(createGrievanceEntry(db, c.get('user'), c.req.param('code'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )
  // A file is added and never changed; taking one back is a withdrawal, not a delete.
  app.post('/:code/attachments', async (c) => c.json(addGrievanceAttachments(db, c.get('user'), c.req.param('code'), await readUploads(await formFiles(c))), 201))
  app.get('/:code/attachments', (c) => c.json(listGrievanceAttachments(db, c.req.param('code'))))
  // Always a download, never shown in the page, and never sniffed into something else: a file someone added cannot run as part of the app.
  app.get('/:code/attachments/:id', (c) => {
    const file = downloadGrievanceAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'))
    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': contentDisposition(file.filename),
      'X-Content-Type-Options': 'nosniff',
    })
  })
  app.post('/:code/attachments/:id/withdraw', requirePermission('grievance.void'), json(grievanceAttachmentWithdrawSchema), (c) =>
    c.json(withdrawGrievanceAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'), c.req.valid('json'))),
  )

  return app
}
