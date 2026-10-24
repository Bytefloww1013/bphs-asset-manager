import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { inboxRoutes, noticeRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { purgeNotifications } from './service.ts'

const SIX_HOURS = 6 * 60 * 60 * 1000

/** The Inbox API (`/api/me/notifications`, `/api/me/notices/:id`), the Notices API (`/api/notices`) and the purge of old notifications. */
export default defineServerModule({
  manifest,
  schema,
  routes: [
    { base: '/me', create: inboxRoutes },
    { base: '/notices', create: noticeRoutes },
  ],
  jobs: [{ name: 'notifications.purge', every: SIX_HOURS, atStart: true, run: purgeNotifications }],
})
