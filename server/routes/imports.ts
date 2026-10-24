import { Hono } from 'hono'
import type { Context } from 'hono'
import { canAt, needsAccess } from '../../shared/permissions.ts'
import { importSchema } from '../../shared/schemas.ts'
import type { Db } from '../db/client.ts'
import { json, type Env } from '../http.ts'
import { open } from '../access/route.ts'
import { forbidden, HttpError } from '../lib/errors.ts'
import { hooks } from '../registry.ts'
import { previewImport, runImport } from '../services/imports.ts'

/**
 * The importer a request names (`hooks('importers')`), once the person is known to be allowed to use it. Anything else cannot
 * be imported at all.
 */
function storeOf(c: Context<Env>) {
  const type = c.req.param('type')
  const store = hooks('importers').find((candidate) => candidate.importer.type === type)
  if (!store) throw new HttpError(404, 'not_importable', 'That kind of record cannot be imported.')
  const { section } = store.importer
  if (!canAt(c.get('user'), section, 'edit')) throw forbidden(needsAccess(section, 'edit'))
  return store
}

/** The Import page's framework: a preview and an import for each importer a module registers. */
export function importRoutes(db: Db) {
  const app = new Hono<Env>()

  app.post('/:type/preview', open(), json(importSchema), (c) =>
    c.json(previewImport(db, storeOf(c), c.req.valid('json'))),
  )
  app.post('/:type', open(), json(importSchema), (c) =>
    c.json(runImport(db, c.get('user'), storeOf(c), c.req.valid('json'))),
  )

  return app
}
