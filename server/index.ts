import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { ensureBootstrapAdmin } from './bootstrap.ts'
import { config, isProduction } from './config.ts'
import { createDb, runMigrations } from './db/client.ts'
import { SERVER_MODULES } from './modules.gen.ts'
import type { Job } from './modules.ts'
import { installModules, jobs, startModules } from './registry.ts'
import { purgeExpiredSessions } from './services/auth.ts'

installModules(SERVER_MODULES)
const { db, sqlite } = createDb(path.join(config.dataDir, 'bphs.sqlite'))
runMigrations(db)
// Before the first Super Admin is made: the default lists go into a database with no users only.
await startModules(db)
await ensureBootstrapAdmin(db)

// Sessions are checked on every request, but expired ones are purged as well, to keep the table tidy. The modules' jobs follow.
const JOBS: readonly Job[] = [
  { name: 'sessions.purge', every: 6 * 60 * 60 * 1000, atStart: true, run: purgeExpiredSessions },
  ...jobs(),
]
// Each job runs on its own: one that fails is logged, and neither stops the others nor takes the server down.
function run(job: Job) {
  const failed = (error: unknown) => console.error(`Job ${job.name} failed:`, error)
  try {
    const result = job.run(db)
    if (result instanceof Promise) result.catch(failed)
  } catch (error) {
    failed(error)
  }
}
for (const job of JOBS) if (job.atStart) run(job)

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

for (const job of JOBS) setInterval(() => run(job), job.every).unref()
