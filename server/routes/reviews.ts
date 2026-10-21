import { Hono } from 'hono'
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
} from '../../shared/schemas.ts'
import { CSV_BOM, toCsv } from '../../shared/csv.ts'
import type { Db } from '../db/client.ts'
import { formFiles, intParam, json, jsonOrFiles, query, requireFull, sendFile, type Env } from '../http.ts'
import { readUploads } from '../lib/uploads.ts'
import { listReviewAudit, listReviewAuditForExport } from '../services/review-audit.ts'
import { addReviewAttachments, downloadReviewAttachment, listReviewAttachments, withdrawReviewAttachment } from '../services/review-attachments.ts'
import { changeReviewCapStatus, createReviewCap, getReviewCap, listReviewActionItems, listReviewCaps, recordActionItemsExport, updateReviewCap } from '../services/review-caps.ts'
import { createReviewEntry, listReviewEntries } from '../services/review-entries.ts'
import { changeReviewStatus, createReview, getReview, listReviews, recordReviewExport, updateReview, voidReview } from '../services/reviews.ts'

/** The Administrative Reviews workspace. Every read is through the signed-in account, so a review about it is never found. */
export function reviewRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', query(reviewListQuerySchema), (c) => c.json(listReviews(db, c.get('user'), c.req.valid('query'))))
  app.post('/', json(reviewCreateSchema), (c) => c.json(createReview(db, c.get('user'), c.req.valid('json')), 201))

  // Declared before `/:code`, so neither is read as a Review ID.
  app.get('/action-items', (c) => c.json(listReviewActionItems(db, c.get('user'))))
  // The list is saved by the browser; the page reports it here so the copy is logged.
  app.post('/action-items/exports', json(reviewActionItemsExportSchema), (c) => {
    recordActionItemsExport(db, c.get('user'), c.req.valid('json'))
    return c.body(null, 204)
  })
  // Read-only for everyone, as the other two logs are. No route writes to it; the changes it describes do.
  app.get('/audit', query(reviewAuditQuerySchema), (c) => c.json(listReviewAudit(db, c.get('user'), c.req.valid('query'))))
  app.get('/audit.csv', query(reviewAuditQuerySchema), (c) => {
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

  app.get('/:code', (c) => c.json(getReview(db, c.get('user'), { code: c.req.param('code') })))
  app.patch('/:code', json(reviewUpdateSchema), (c) => c.json(updateReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))
  app.post('/:code/status', json(reviewStatusChangeSchema), (c) => c.json(changeReviewStatus(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))
  // Voiding is for a review entered by mistake, and it has no way back.
  app.post('/:code/void', requireFull('reviews'), json(reviewVoidSchema), (c) => c.json(voidReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))

  // The report is printed by the browser; the page reports it here so the copy is logged.
  app.post('/:code/exports', (c) => {
    recordReviewExport(db, c.get('user'), c.req.param('code'))
    return c.body(null, 204)
  })

  app.get('/:code/entries', (c) => c.json(listReviewEntries(db, c.get('user'), c.req.param('code'))))
  app.post('/:code/entries', jsonOrFiles(reviewEntryCreateSchema), async (c) =>
    c.json(createReviewEntry(db, c.get('user'), c.req.param('code'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )

  // A CAP is never removed: one entered by mistake is cancelled, with the reason on the history.
  app.get('/:code/caps', (c) => c.json(listReviewCaps(db, c.get('user'), c.req.param('code'))))
  app.post('/:code/caps', jsonOrFiles(reviewCapCreateSchema), async (c) =>
    c.json(createReviewCap(db, c.get('user'), c.req.param('code'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )
  app.get('/:code/caps/:cap', (c) => c.json(getReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'))))
  app.patch('/:code/caps/:cap', json(reviewCapUpdateSchema), (c) => c.json(updateReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'), c.req.valid('json'))))
  app.post('/:code/caps/:cap/status', jsonOrFiles(reviewCapStatusSchema), async (c) =>
    c.json(changeReviewCapStatus(db, c.get('user'), c.req.param('code'), c.req.param('cap'), c.req.valid('json'), await readUploads(await formFiles(c)))),
  )

  // A file is added and never changed; taking one back is a withdrawal, not a delete.
  app.post('/:code/attachments', jsonOrFiles(reviewAttachmentsSchema), async (c) =>
    c.json(addReviewAttachments(db, c.get('user'), c.req.param('code'), c.req.valid('json'), await readUploads(await formFiles(c))), 201),
  )
  app.get('/:code/attachments', (c) => c.json(listReviewAttachments(db, c.get('user'), c.req.param('code'))))
  app.get('/:code/attachments/:id', (c) => sendFile(c, downloadReviewAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'))))
  app.post('/:code/attachments/:id/withdraw', requireFull('reviews'), json(reviewAttachmentWithdrawSchema), (c) =>
    c.json(withdrawReviewAttachment(db, c.get('user'), c.req.param('code'), intParam(c, 'id'), c.req.valid('json'))),
  )

  return app
}
