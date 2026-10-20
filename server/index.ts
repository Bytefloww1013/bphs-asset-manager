import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { ensureBootstrapAdmin, ensureDefaultLists } from './bootstrap.ts'
import { config, isProduction } from './config.ts'
import { createDb, runMigrations } from './db/client.ts'
import { purgeExpiredSessions } from './services/auth.ts'
import { purgeNotifications, sendOverdueReminders } from './services/notifications.ts'

const { db, sqlite } = createDb(path.join(config.dataDir, 'bphs.sqlite'))
runMigrations(db)
ensureDefaultLists(db)
await ensureBootstrapAdmin(db)
// Sessions are checked on every request, but keep the tables tidy: expired sessions and year-old notifications.
// The same timer sends the overdue reminders.
// Each job runs on its own: one that fails is logged, and neither stops the others nor takes the server down.
function tidy() {
  for (const job of [purgeExpiredSessions, purgeNotifications, sendOverdueReminders]) {
    try {
      job(db)
    } catch (error) {
      console.error(error)
    }
  }
}
tidy()

const app = createApp(db, { serveWeb: isProduction || process.env.SERVE_WEB === 'true' })
const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`BPHS-Connect listening on :${info.port} (${config.env}), data in ${config.dataDir}`)
})

// Docker sends SIGTERM on stop: finish in-flight requests, then close the database cleanly.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(() => {
    sqlite.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

setInterval(tidy, 6 * 60 * 60 * 1000).unref()
