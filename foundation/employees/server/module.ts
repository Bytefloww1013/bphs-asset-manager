import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { employeeRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { employeeImport } from './service.ts'

/** The Employees API (`/api/employees`) and its importer. Its demo data is inserted by `server/seed.ts` (`seedEmployees`). */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/employees', create: employeeRoutes }],
  hooks: { importers: [employeeImport] },
})
