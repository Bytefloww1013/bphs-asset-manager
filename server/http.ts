import { zValidator } from '@hono/zod-validator'
import type { Context, MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'
import { can, type Permission, SUPER_ADMIN_ONLY } from '../shared/permissions.ts'
import type { AuthUser } from './services/auth.ts'
import { HttpError, forbidden } from './lib/errors.ts'

export type Env = { Variables: { user: AuthUser; token: string } }

/** Validate a JSON body; failures come back as 422 with a message per field. */
export function json<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (result.success) return
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_'
      fields[key] ??= issue.message
    }
    const first = Object.values(fields)[0] ?? 'The request is not valid.'
    return c.json({ error: 'validation_failed', message: first, details: { fields } }, 422)
  })
}

export function query<T extends ZodType>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (result.success) return
    return c.json({ error: 'validation_failed', message: 'The query is not valid.' }, 422)
  })
}

export function requirePermission(permission: Permission): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!can(c.get('user').role, permission)) throw forbidden(SUPER_ADMIN_ONLY)
    await next()
  }
}

export function intParam(c: Context, name: string): number {
  const value = Number(c.req.param(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new HttpError(404, 'not_found', 'Not found.')
  }
  return value
}
