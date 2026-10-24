import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { grievanceRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { grievanceEmployeeReferences } from './service.ts'

/** Grievances: the cases, their timelines, files and versions, the categories and the Grievance Audit Log. It never notifies. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/grievances', create: grievanceRoutes }],
  seed: async (db, kit) => `${(await import('./seed.ts')).seedGrievances(db, kit.now, kit.byCode, kit)} grievances`,
  hooks: {
    // An employee named on a grievance cannot be deleted.
    'employee.references': [grievanceEmployeeReferences],
  },
})
