import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { undeclaredRoutes } from './access/route.ts'
import { config } from './config.ts'
import type { Db } from './db/client.ts'
import { forUpload, limitBody, type Env } from './http.ts'
import { describeError } from './lib/errors.ts'
import { authenticate } from './middleware.ts'
import { routes, webhooks } from './registry.ts'
import { authRoutes } from './routes/auth.ts'
import { importRoutes } from './routes/imports.ts'
import { listRoutes } from './routes/lists.ts'
import { userRoutes } from './routes/users.ts'

export interface AppOptions {
  /** Serve the built SPA (production). */
  serveWeb?: boolean
  /** Where the built SPA is. Defaults to config.webDir; tests point it at a folder of their own. */
  webDir?: string
  quiet?: boolean
  /** Defaults to config.maintenanceWebhookSecret; tests set their own. */
  maintenanceWebhookSecret?: string
}

// The largest thing anyone sends is an import: 2,000 rows of at most five 300-character cells as JSON, which fits with room to spare; signing in and changing a password send two short strings.
const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_AUTH_BODY_BYTES = 16 * 1024

export function createApp(db: Db, options: AppOptions = {}) {
  const app = new Hono<Env>()

  if (!options.quiet) app.use('*', logger())
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // The Excel reader and writer zip in a worker they start from a blob: URL. Only a script this page already runs can make one.
        workerSrc: ["'self'", 'blob:'],
        // Radix positions popovers with inline style attributes.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      // Plain HTTP on the office LAN is a supported deployment; HSTS would pin browsers to HTTPS.
      strictTransportSecurity: false,
    }),
  )
  app.use('/api/*', csrf())
  app.use('/api/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  // A body is refused before anything reads it, signed in or not: the smaller limit first, so it answers for the sign-in routes.
  // An upload is the exception: its route's larger limit buffers the body, so it waits until the session is checked (upload()).
  app.use('/api/auth/*', limitBody(MAX_AUTH_BODY_BYTES))
  const bodyLimitAll = limitBody(MAX_BODY_BYTES)
  app.use('/api/*', (c, next) => (forUpload(c) ? next() : bodyLimitAll(c, next)))

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes(db))
  // Zoho's calls carry a shared secret, not a session, so they are answered before the sign-in check below.
  for (const webhook of webhooks()) app.route(`/api/webhooks${webhook.base}`, webhook.create(db, options))

  // Everything below needs a signed-in user, and every route says what else it needs (server/access/route.ts).
  const api = new Hono<Env>()
  api.use('*', authenticate(db))
  for (const router of routes()) api.route(router.base || '/', router.create(db, options))
  // The Users page is the kernel's own, and so are the frameworks the modules' importers and lookup lists plug into.
  api.route('/users', userRoutes(db))
  api.route('/import', importRoutes(db))
  api.route('/', listRoutes(db))
  const undeclared = undeclaredRoutes(api)
  if (undeclared.length) throw new Error(`These API routes don't declare their access: ${undeclared.join(', ')}`)
  app.route('/api', api)

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    const problem = describeError(error)
    if (problem.status >= 500) console.error(error)
    return c.json({ error: problem.code, message: problem.message, details: problem.details }, problem.status as 400)
  })

  app.all('/api/*', (c) => c.json({ error: 'not_found', message: 'Not found.' }, 404))

  if (options.serveWeb) mountWeb(app, options.webDir ?? config.webDir)
  return app
}

function mountWeb(app: Hono<Env>, webDir: string) {
  const root = path.relative(process.cwd(), webDir) || '.'
  if (!fs.existsSync(path.join(webDir, 'index.html'))) {
    console.warn(`No built web app at ${webDir}. Run "bun run build" first.`)
    return
  }
  // Built files are content-hashed, so a file that was found can be cached forever; the shell must always be revalidated,
  // and the answer for a file that is not there must not be kept at all.
  app.use('*', async (c, next) => {
    await next()
    if (c.req.path.startsWith('/api/')) return
    const built = c.req.path.startsWith('/static/')
    c.header('Cache-Control', !built ? 'no-cache' : c.res.ok ? 'public, max-age=31536000, immutable' : 'no-store')
  })
  app.use('*', serveStatic({ root }))
  // A built file that is gone (a tab still running the previous build asks for one after an upgrade) is a 404; the shell would be
  // HTML with a 200 where a script was asked for.
  app.all('/static/*', (c) => c.text('Not found', 404))
  // Client-side routes: always answer with the shell and let the router decide.
  app.get('*', serveStatic({ path: path.join(root, 'index.html') }))
}
