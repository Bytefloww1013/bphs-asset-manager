// Route-level access (issue #23): every API route behind the session check names what it needs, as its first handler.
// `createApp` refuses to start while a route doesn't (default-deny), and a path no route declares is answered 404.
import type { Hono, MiddlewareHandler } from 'hono'
import type { AccessLevel, Section } from '../../shared/constants.ts'
import { canAt, needsAccess } from '../../shared/permissions.ts'
import type { Env } from '../http.ts'
import { forbidden } from '../lib/errors.ts'
import type { AuthUser } from '../services/auth.ts'

export type Declaration =
  | { needs: 'level'; resource: Section; level: AccessLevel }
  | { needs: 'service'; resource: Section }
  | { needs: 'signed-in' }
  | { needs: 'super-admin' }

const DECLARED = new WeakMap<object, Declaration>()

function declare(declaration: Declaration, check?: (user: AuthUser) => void): MiddlewareHandler<Env> {
  const handler: MiddlewareHandler<Env> = async (c, next) => {
    check?.(c.get('user'))
    await next()
  }
  DECLARED.set(handler, declaration)
  return handler
}

/** The route needs `level` in `resource`. */
export function requires(resource: Section, level: AccessLevel): MiddlewareHandler<Env> {
  return declare({ needs: 'level', resource, level }, (user) => {
    if (!canAt(user, resource, level)) throw forbidden(needsAccess(resource, level))
  })
}

/** Read in `resource` lets the request in, and the service decides the rest: who may assign, edit, approve or act on their own. */
export function serviceDecides(resource: Section): MiddlewareHandler<Env> {
  return declare({ needs: 'service', resource }, (user) => {
    if (!canAt(user, resource, 'read')) throw forbidden(needsAccess(resource, 'read'))
  })
}

/** Any signed-in account, whatever its access: My Space, reading the employee list, the importers (each checks where it writes). */
export function open(): MiddlewareHandler<Env> {
  return declare({ needs: 'signed-in' })
}

/** Super Admins only: the Users page and notices. */
export function superAdmin(): MiddlewareHandler<Env> {
  return declare({ needs: 'super-admin' }, (user) => {
    if (!user.superAdmin) throw forbidden('Only a Super Admin can do this.')
  })
}

export function declarationOf(handler: unknown): Declaration | undefined {
  return typeof handler === 'function' ? DECLARED.get(handler) : undefined
}

/**
 * The routes of `app` that declare no access, as `METHOD /path`. A route's first handler must be its declaration, so access is
 * checked before anything reads the body. `use()` middleware (method ALL, a path ending in `*`) is skipped; any other ALL route
 * is listed, since it can't say which methods it answers.
 */
export function undeclaredRoutes(app: Hono<Env>): string[] {
  const seen = new Set<string>()
  const problems: string[] = []
  for (const route of app.routes) {
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    if (route.method === 'ALL' ? !route.path.endsWith('*') : !DECLARED.has(route.handler)) problems.push(key)
  }
  return problems
}
