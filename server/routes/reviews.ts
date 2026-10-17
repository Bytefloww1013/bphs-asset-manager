import { Hono } from 'hono'
import {
  reviewActionItemsExportSchema,
  reviewCapCreateSchema,
  reviewCapStatusSchema,
  reviewCapUpdateSchema,
  reviewCreateSchema,
  reviewEntryCreateSchema,
  reviewListQuerySchema,
  reviewUpdateSchema,
} from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, query, type Env } from '../http.ts'
import { changeReviewCapStatus, createReviewCap, getReviewCap, listReviewActionItems, listReviewCaps, recordActionItemsExport, updateReviewCap } from '../services/review-caps.ts'
import { createReviewEntry, listReviewEntries } from '../services/review-entries.ts'
import { createReview, getReview, listReviews, updateReview } from '../services/reviews.ts'

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

  app.get('/:code', (c) => c.json(getReview(db, c.get('user'), { code: c.req.param('code') })))
  app.patch('/:code', json(reviewUpdateSchema), (c) => c.json(updateReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))

  app.get('/:code/entries', (c) => c.json(listReviewEntries(db, c.get('user'), c.req.param('code'))))
  app.post('/:code/entries', json(reviewEntryCreateSchema), (c) => c.json(createReviewEntry(db, c.get('user'), c.req.param('code'), c.req.valid('json')), 201))

  // A CAP is never removed: one entered by mistake is cancelled, with the reason on the history.
  app.get('/:code/caps', (c) => c.json(listReviewCaps(db, c.get('user'), c.req.param('code'))))
  app.post('/:code/caps', json(reviewCapCreateSchema), (c) => c.json(createReviewCap(db, c.get('user'), c.req.param('code'), c.req.valid('json')), 201))
  app.get('/:code/caps/:cap', (c) => c.json(getReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'))))
  app.patch('/:code/caps/:cap', json(reviewCapUpdateSchema), (c) => c.json(updateReviewCap(db, c.get('user'), c.req.param('code'), c.req.param('cap'), c.req.valid('json'))))
  app.post('/:code/caps/:cap/status', json(reviewCapStatusSchema), (c) =>
    c.json(changeReviewCapStatus(db, c.get('user'), c.req.param('code'), c.req.param('cap'), c.req.valid('json'))),
  )

  return app
}
