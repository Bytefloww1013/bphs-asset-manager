import { config } from '#kernel/config.ts'
import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { maintenanceRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { maintenanceEmployeeReferences } from './service.ts'
import { webhookRoutes } from './webhook.ts'

/** The Maintenance API (`/api/maintenance`), and the Zoho form's webhook (`/api/webhooks/maintenance`), which is off without a secret. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/maintenance', create: maintenanceRoutes }],
  webhooks: [
    {
      base: '/maintenance',
      create: (db, options) => webhookRoutes(db, options.maintenanceWebhookSecret ?? config.maintenanceWebhookSecret),
    },
  ],
  hooks: { 'employee.references': [maintenanceEmployeeReferences] },
})
