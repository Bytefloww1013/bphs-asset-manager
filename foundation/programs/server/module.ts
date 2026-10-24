import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { programRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { programImport } from './service.ts'

/** The Programs API (`/api/programs`, behind Assets access) and its importer. Its demo data is inserted by `server/seed.ts`. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/programs', create: programRoutes }],
  hooks: { importers: [programImport] },
})
