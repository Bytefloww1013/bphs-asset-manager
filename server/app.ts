import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './config.ts'
import type { Db } from './db/client.ts'
import { requirePermission, type Env } from './http.ts'
import { HttpError } from './lib/errors.ts'
import { authenticate } from './middleware.ts'
import { assetRoutes, assignmentRoutes } from './routes/assets.ts'
import { authRoutes } from './routes/auth.ts'
import { listRoutes, reportRoutes } from './routes/lists.ts'
import { employeeRoutes, userRoutes } from './routes/people.ts'

export interface AppOptions {
  /** Serve the built SPA from config.webDir (production). */
  serveWeb?: boolean
  quiet?: boolean
}

export function createApp(db: Db, options: AppOptions = {}) {
  const app = new Hono<Env>()

  if (!options.quiet) app.use('*', logger())
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
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

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes(db))

  // Everything below needs a signed-in user.
  const api = new Hono<Env>()
  api.use('*', authenticate(db))
  api.route('/', reportRoutes(db))
  api.route('/assets', assetRoutes(db))
  api.route('/assignments', assignmentRoutes(db))
  api.route('/employees', employeeRoutes(db))
  api.route('/', listRoutes(db))
  api.use('/users/*', requirePermission('users.manage'))
  api.use('/users', requirePermission('users.manage'))
  api.route('/users', userRoutes(db))
  app.route('/api', api)

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.code, message: error.message, details: error.details }, error.status as 400)
    }
    if (error instanceof HTTPException) return error.getResponse()
    const code = (error as { code?: string }).code ?? ''
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' && /assignments\.asset_id/.test(error.message)) {
      return c.json({ error: 'asset_already_assigned', message: 'This asset is already assigned.' }, 409)
    }
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      return c.json({ error: 'conflict', message: 'That change conflicts with existing records.' }, 409)
    }
    console.error(error)
    return c.json({ error: 'internal_error', message: 'Something went wrong on the server.' }, 500)
  })

  app.all('/api/*', (c) => c.json({ error: 'not_found', message: 'Not found.' }, 404))

  if (options.serveWeb) mountWeb(app)
  return app
}

function mountWeb(app: Hono<Env>) {
  const root = path.relative(process.cwd(), config.webDir) || '.'
  if (!fs.existsSync(path.join(config.webDir, 'index.html'))) {
    console.warn(`No built web app at ${config.webDir}. Run "npm run build" first.`)
    return
  }
  // Built files are content-hashed, so they can be cached forever; the shell must always be revalidated.
  app.use('*', async (c, next) => {
    await next()
    if (c.req.path.startsWith('/api/')) return
    c.header('Cache-Control', c.req.path.startsWith('/static/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  })
  app.use('*', serveStatic({ root }))
  // Client-side routes: always answer with the shell and let the router decide.
  app.get('*', serveStatic({ path: path.join(root, 'index.html') }))
}
