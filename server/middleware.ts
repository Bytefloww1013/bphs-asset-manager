import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { config } from './config.ts'
import type { Db } from './db/client.ts'
import type { Env } from './http.ts'
import { HttpError } from './lib/errors.ts'
import { findSession } from './services/auth.ts'

export const COOKIE = 'bphs_session'

/**
 * A remembered session's cookie lasts as long as the session does, so it is sent again whenever the session is moved forward.
 * Without `expiresAt` the cookie ends when the browser closes.
 */
export function setSessionCookie(c: Context, token: string, expiresAt?: Date) {
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: config.cookieSecure, path: '/', expires: expiresAt })
}

/** Paths a user who must change their password may still reach. */
const ALLOWED_WHEN_PASSWORD_EXPIRED = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/password-change'])

// The bell asks for its count every 30 seconds by itself: counting that as activity would keep an unattended tab signed in for ever.
const NOT_ACTIVITY = new Set(['/api/me/notifications/count'])

export function authenticate(db: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const token = getCookie(c, COOKIE)
    const found = token ? findSession(db, token, new Date(), !NOT_ACTIVITY.has(c.req.path)) : null
    if (!token || !found) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.')
    // Without this, a session the server keeps moving forward still ends in the browser at a fixed time after sign-in.
    if (found.extendedTo) setSessionCookie(c, token, found.extendedTo)
    const { user } = found
    if (user.mustChangePassword && !ALLOWED_WHEN_PASSWORD_EXPIRED.has(c.req.path)) {
      throw new HttpError(403, 'password_change_required', 'Set a new password before continuing.')
    }
    c.set('user', user)
    c.set('token', token)
    await next()
  }
}
