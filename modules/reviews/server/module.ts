import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { reviewRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { reviewEmployeeReferences } from './service.ts'

/** Administrative Reviews: the reviews, their CAPs, history and files, and the Review Audit Log. It never notifies. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/reviews', create: reviewRoutes }],
  seed: async (db, kit) => `${(await import('./seed.ts')).seedReviews(db, kit.now, kit.byCode, kit)} reviews`,
  hooks: {
    // An employee named on a review cannot be deleted, and one with open review work cannot be archived.
    'employee.references': [reviewEmployeeReferences],
  },
})
