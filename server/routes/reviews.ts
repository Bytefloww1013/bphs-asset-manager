import { Hono } from 'hono'
import { reviewCreateSchema, reviewEntryCreateSchema, reviewListQuerySchema, reviewUpdateSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, query, type Env } from '../http.ts'
import { createReviewEntry, listReviewEntries } from '../services/review-entries.ts'
import { createReview, getReview, listReviews, updateReview } from '../services/reviews.ts'

/** The Administrative Reviews workspace. Every read is through the signed-in account, so a review about it is never found. */
export function reviewRoutes(db: Db) {
  const app = new Hono<Env>()

  app.get('/', query(reviewListQuerySchema), (c) => c.json(listReviews(db, c.get('user'), c.req.valid('query'))))
  app.post('/', json(reviewCreateSchema), (c) => c.json(createReview(db, c.get('user'), c.req.valid('json')), 201))

  app.get('/:code', (c) => c.json(getReview(db, c.get('user'), { code: c.req.param('code') })))
  app.patch('/:code', json(reviewUpdateSchema), (c) => c.json(updateReview(db, c.get('user'), c.req.param('code'), c.req.valid('json'))))

  app.get('/:code/entries', (c) => c.json(listReviewEntries(db, c.get('user'), c.req.param('code'))))
  app.post('/:code/entries', json(reviewEntryCreateSchema), (c) => c.json(createReviewEntry(db, c.get('user'), c.req.param('code'), c.req.valid('json')), 201))

  return app
}
