import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Db } from './db/client.ts'
import type { Env } from './http.ts'
import { HttpError } from './lib/errors.ts'
import { findSession } from './services/auth.ts'

export const COOKIE = 'bphs_session'

/** Paths a user who must change their password may still reach. */
const ALLOWED_WHEN_PASSWORD_EXPIRED = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/password-change'])

export function authenticate(db: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const token = getCookie(c, COOKIE)
    const user = token ? findSession(db, token) : null
    if (!token || !user) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.')
    if (user.mustChangePassword && !ALLOWED_WHEN_PASSWORD_EXPIRED.has(c.req.path)) {
      throw new HttpError(403, 'password_change_required', 'Set a new password before continuing.')
    }
    c.set('user', user)
    c.set('token', token)
    await next()
  }
}
