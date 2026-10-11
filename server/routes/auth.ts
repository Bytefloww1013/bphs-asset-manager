import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { loginSchema, passwordChangeSchema } from '../../shared/schemas.ts'
import { config } from '../config.ts'
import type { Db } from '../db/client.ts'
import { json, type Env } from '../http.ts'
import { changePassword, deleteSession, login, toSessionUser } from '../services/auth.ts'
import { COOKIE, authenticate } from '../middleware.ts'

export function authRoutes(db: Db) {
  const app = new Hono<Env>()

  app.post('/login', json(loginSchema), async (c) => {
    const { email, password } = c.req.valid('json')
    const result = await login(db, email, password)
    setCookie(c, COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.cookieSecure,
      path: '/',
      expires: result.expiresAt,
    })
    return c.json({ user: toSessionUser(result.user) })
  })

  app.post('/logout', (c) => {
    const token = getCookie(c, COOKIE)
    if (token) deleteSession(db, token)
    deleteCookie(c, COOKIE, { path: '/' })
    return c.body(null, 204)
  })

  app.get('/me', authenticate(db), (c) => c.json({ user: toSessionUser(c.get('user')) }))

  app.post('/password-change', authenticate(db), json(passwordChangeSchema), async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json')
    await changePassword(db, c.get('user'), currentPassword, newPassword, c.get('token'))
    return c.json({ user: toSessionUser({ ...c.get('user'), mustChangePassword: false }) })
  })

  return app
}

