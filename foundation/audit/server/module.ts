import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { auditRoutes } from './routes.ts'
import * as schema from './schema.ts'

/** The Audit log API (`/api/audit`, `/api/audit.csv`). Every module writes to the log through `writeAudit()`. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '', create: auditRoutes }],
})
