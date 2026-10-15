import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_REQUEST } from '../shared/constants.ts'
import { config } from './config.ts'
import type { Db } from './db/client.ts'
import { requirePermission, type Env } from './http.ts'
import { describeError } from './lib/errors.ts'
import { authenticate } from './middleware.ts'
import { assetRoutes, assignmentRoutes } from './routes/assets.ts'
import { authRoutes } from './routes/auth.ts'
import { listRoutes, reportRoutes } from './routes/lists.ts'
import { employeeRoutes, userRoutes } from './routes/people.ts'
import { digitalAssetRoutes } from './routes/digital-assets.ts'
import { grievanceRoutes } from './routes/grievances.ts'
import { importRoutes } from './routes/imports.ts'
import { programRoutes } from './routes/programs.ts'

export interface AppOptions {
  /** Serve the built SPA (production). */
  serveWeb?: boolean
  /** Where the built SPA is. Defaults to config.webDir; tests point it at a folder of their own. */
  webDir?: string
  quiet?: boolean
}

// The largest thing anyone sends is an import: 2,000 rows of at most five 300-character cells as JSON, which fits with room to spare; signing in and changing a password send two short strings.
const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_AUTH_BODY_BYTES = 16 * 1024
// The routes that take a grievance's files, as multipart: ten files at their limit, and room for the form beside them.
const MAX_UPLOAD_BODY_BYTES = ATTACHMENTS_PER_REQUEST * ATTACHMENT_MAX_BYTES + 1024 * 1024
const UPLOAD_PATH = /^\/api\/grievances(\/[^/]+\/(entries|attachments))?$/

const limitBody = (maxSize: number) =>
  bodyLimit({ maxSize, onError: (c) => c.json({ error: 'payload_too_large', message: 'That request is too large.' }, 413) })

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
  // An upload is the exception: its larger limit buffers the body, so it waits until the session is checked (below).
  app.use('/api/auth/*', limitBody(MAX_AUTH_BODY_BYTES))
  const [uploadLimit, bodyLimitAll] = [limitBody(MAX_UPLOAD_BODY_BYTES), limitBody(MAX_BODY_BYTES)]
  const isUpload = (c: Context) =>
    c.req.method === 'POST' && UPLOAD_PATH.test(c.req.path) && /^multipart\/form-data/i.test(c.req.header('Content-Type') ?? '')
  app.use('/api/*', (c, next) => (isUpload(c) ? next() : bodyLimitAll(c, next)))

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes(db))

  // Everything below needs a signed-in user.
  const api = new Hono<Env>()
  api.use('*', authenticate(db))
  api.use('*', (c, next) => (isUpload(c) ? uploadLimit(c, next) : next()))
  api.route('/', reportRoutes(db))
  api.route('/assets', assetRoutes(db))
  api.route('/assignments', assignmentRoutes(db))
  api.route('/employees', employeeRoutes(db))
  api.route('/programs', programRoutes(db))
  api.route('/import', importRoutes(db))
  api.route('/digital-assets', digitalAssetRoutes(db))
  api.route('/grievances', grievanceRoutes(db))
  api.route('/', listRoutes(db))
  api.use('/users/*', requirePermission('users.manage'))
  api.use('/users', requirePermission('users.manage'))
  api.route('/users', userRoutes(db))
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
