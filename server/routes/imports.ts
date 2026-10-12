import { Hono } from 'hono'
import type { Context } from 'hono'
import { importerFor } from '../../shared/importers.ts'
import { can, SUPER_ADMIN_ONLY } from '../../shared/permissions.ts'
import { importSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, type Env } from '../http.ts'
import { forbidden, HttpError } from '../lib/errors.ts'
import { previewImport, runImport } from '../services/imports.ts'

/** The importer a request names, once the person is known to be allowed to use it. Anything else cannot be imported at all. */
function importerOf(c: Context<Env>) {
  const importer = importerFor(c.req.param('type') ?? '')
  if (!importer) throw new HttpError(404, 'not_importable', 'That kind of record cannot be imported.')
  if (!can(c.get('user').role, importer.permission)) throw forbidden(SUPER_ADMIN_ONLY)
  return importer
}

export function importRoutes(db: Db) {
  const app = new Hono<Env>()

  app.post('/:type/preview', json(importSchema), (c) => c.json(previewImport(db, importerOf(c), c.req.valid('json'))))
  app.post('/:type', json(importSchema), (c) => c.json(runImport(db, c.get('user'), importerOf(c), c.req.valid('json'))))

  return app
}
