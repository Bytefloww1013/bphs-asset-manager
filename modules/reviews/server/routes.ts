import { Hono } from 'hono'
import { requires, serviceDecides } from '#kernel/access/route.ts'
import type { Db } from '#kernel/db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requireFull, sendFile, upload, type Env } from '#kernel/http.ts'
import { readUploads } from '#kernel/lib/uploads.ts'
import { CSV_BOM, toCsv } from '#shared/csv.ts'
import {
  reviewActionItemsExportSchema,
  reviewAttachmentsSchema,
  reviewAttachmentWithdrawSchema,
  reviewAuditQuerySchema,
  reviewCapCreateSchema,
  reviewCapStatusSchema,
  reviewCapUpdateSchema,
  reviewCreateSchema,
  reviewEntryCreateSchema,
  reviewListQuerySchema,
  reviewStatusChangeSchema,
  reviewUpdateSchema,
  reviewVoidSchema,
} from '../shared/schemas.ts'
import {
  addReviewAttachments,
  downloadReviewAttachment,
  listReviewAttachments,
  withdrawReviewAttachment,
} from './attachments.ts'
import { listReviewAudit, listReviewAuditForExport } from './audit.ts'
import {
  changeReviewCapStatus,
  createReviewCap,
  getReviewCap,
  listReviewActionItems,
  listReviewCaps,
  recordActionItemsExport,
  updateReviewCap,
} from './caps.ts'
import { createReviewEntry, listReviewEntries } from './entries.ts'
import {
  changeReviewStatus,
  createReview,
  getReview,
  listReviews,
  recordReviewExport,
  updateReview,
  voidReview,
} from './service.ts'

/** The Administrative Reviews workspace. Every read is through the signed-in account, so a review about it is never found. */
export function reviewRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', requires('reviews', 'read'), query(reviewListQuerySchema), (c) =>
    c.json(listReviews(db, c.get('user'), c.req.valid('query'))),
  )
  app.post('/', requires('reviews', 'edit'), json(reviewCreateSchema), (c) =>
    c.json(createReview(db, c.get('user'), c.req.valid('json')), 201),
  )

  // Declared before `/:code`, so neither is read as a Review ID.
  app.get('/action-items', requires('reviews', 'read'), (c) => c.json(listReviewActionItems(db, c.get('user'))))
  // The list is saved by the browser; the page reports it here so the copy is logged.
  app.post('/action-items/exports', serviceDecides('reviews'), json(reviewActionItemsExportSchema), (c) => {
    recordActionItemsExport(db, c.get('user'), c.req.valid('json'))
    return c.body(null, 204)
  })
  // Read-only for everyone, as the other two logs are. No route writes to it; the changes it describes do.
  app.get('/audit', requires('reviews', 'read'), query(reviewAuditQuerySchema), (c) =>
    c.json(listReviewAudit(db, c.get('user'), c.req.valid('query'))),
  )
  app.get('/audit.csv', requires('reviews', 'read'), query(reviewAuditQuerySchema), (c) => {
    const entries = listReviewAuditForExport(db, c.get('user'), c.req.valid('query'))
    const csv = toCsv(
      ['occurred_at', 'user', 'action', 'entity_type', 'entity_id', 'details'],
      entries.map((e) => [e.occurredAt, e.actor, e.action, e.entityType, e.entityId, e.details]),
    )
    return c.body(CSV_BOM + csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="review-audit-log.csv"',
    })
  })

  app.get('/:code', requires('reviews', 'read'), (c) =>
    c.json(getReview(db, c.get('user'), { code: c.req.param('code') })),
  )
  app.patch('/:code', serviceDecides('reviews'), json(reviewUpdateSchema), (c) =>
    c.json(updateReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  app.post('/:code/status', serviceDecides('reviews'), json(reviewStatusChangeSchema), (c) =>
    c.json(changeReviewStatus(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )
  // Voiding is for a review entered by mistake, and it has no way back.
  app.post('/:code/void', requires('reviews', 'edit'), requireFull('reviews'), json(reviewVoidSchema), (c) =>
    c.json(voidReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))),
  )

  // The report is printed by the browser; the page reports it here so the copy is logged.
  app.post('/:code/exports', serviceDecides('reviews'), (c) => {
    recordReviewExport(db, c.get('user'), c.req.param('code'))
    return c.body(null, 204)
  })

  app.get('/:code/entries', requires('reviews', 'read'), (c) =>
    c.json(listReviewEntries(db, c.get('user'), c.req.param('code'))),
  )
  app.post('/:code/entries', serviceDecides('reviews'), upload(), jsonOrFiles(reviewEntryCreateSchema), async (c) =>
    c.json(
      createReviewEntry(
        db,
        c.get('user'),
        c.req.param('code'),
        c.req.valid('json'),
        await readUploads(await formFiles(c)),
      ),
      201,
    ),
  )

  // A CAP is never removed: one entered by mistake is cancelled, with the reason on the history.
  app.get('/:code/caps', requires('reviews', 'read'), (c) =>
    c.json(listReviewCaps(db, c.get('user'), c.req.param('code'))),
  )
  app.post('/:code/caps', serviceDecides('reviews'), upload(), jsonOrFiles(reviewCapCreateSchema), async (c) =>
    c.json(
      createReviewCap(
        db,
        c.get('user'),
        c.req.param('code'),
        c.req.valid('json'),
        await readUploads(await formFiles(c)),
      ),
      201,
    ),
  )
  app.get('/:code/caps/:cap', requires('reviews', 'read'), (c) =>
    c.json(getReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'))),
  )
  app.patch('/:code/caps/:cap', serviceDecides('reviews'), json(reviewCapUpdateSchema), (c) =>
    c.json(updateReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'), c.req.valid('json'))),
  )
  app.post(
    '/:code/caps/:cap/status',
    serviceDecides('reviews'),
    upload(),
    jsonOrFiles(reviewCapStatusSchema),
    async (c) =>
      c.json(
        changeReviewCapStatus(
          db,
          c.get('user'),
          c.req.param('code'),
          c.req.param('cap'),
          c.req.valid('json'),
          await readUploads(await formFiles(c)),
        ),
      ),
  )

  // A file is added and never changed; taking one back is a withdrawal, not a delete.
  app.post('/:code/attachments', serviceDecides('reviews'), upload(), jsonOrFiles(reviewAttachmentsSchema), async (c) =>
    c.json(
      addReviewAttachments(
        db,
        c.get('user'),
        c.req.param('code'),
        c.req.valid('json'),
        await readUploads(await formFiles(c)),
      ),
      201,
    ),
  )
  app.get('/:code/attachments', requires('reviews', 'read'), (c) =>
    c.json(listReviewAttachments(db, c.get('user'), c.req.param('code'))),
  )
  app.get('/:code/attachments/:id', requires('reviews', 'read'), (c) =>
    sendFile(c, downloadReviewAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'))),
  )
  app.post(
    '/:code/attachments/:id/withdraw',
    requires('reviews', 'edit'),
    requireFull('reviews'),
    json(reviewAttachmentWithdrawSchema),
    (c) =>
      c.json(withdrawReviewAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'), c.req.valid('json'))),
  )

  return app
}
