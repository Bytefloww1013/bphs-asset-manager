import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Db } from '#kernel/db/client.ts'
import { MAINTENANCE_DESCRIPTION_MAX } from '../shared/constants.ts'
import { createMaintenanceRequest, type NewMaintenanceRequest } from './service.ts'

const digest = (value: string) => createHash('sha256').update(value).digest()
// Digests are the same length whatever was sent, so the comparison takes the same time and never throws.
const secretMatches = (sent: string | undefined, secret: string) =>
  sent !== undefined && timingSafeEqual(digest(sent), digest(secret))

// Far above anything the form produces. Longer text is cut, not refused: Zoho does not retry, so a refused entry is lost.
const LIMITS = {
  firstName: 100,
  lastName: 100,
  email: 254,
  program: 100,
  location: 200,
  description: MAINTENANCE_DESCRIPTION_MAX,
  urgent: 100,
  requestDate: 100,
  noticedDate: 100,
  addedTime: 100,
} as const

/** A Zoho entry, read leniently: only the description must be there. Values that are not text, and keys not listed, are ignored. */
export function readZohoEntry(body: unknown): NewMaintenanceRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const field = (key: keyof typeof LIMITS) => {
    const value = (body as Record<string, unknown>)[key]
    return typeof value === 'string' ? value.trim().slice(0, LIMITS[key]) : ''
  }
  const description = field('description')
  if (!description) return null
  return {
    firstName: field('firstName'),
    lastName: field('lastName') || null,
    email: field('email').toLowerCase(),
    program: field('program'),
    location: field('location'),
    description,
    urgent: field('urgent') || null,
    requestDate: field('requestDate') || null,
    noticedDate: field('noticedDate') || null,
    zohoAddedTime: field('addedTime') || null,
  }
}

/** Inbound only, and signed in by a shared secret rather than a session. Off unless the secret is configured. */
export function webhookRoutes(db: Db, secret: string | undefined) {
  const app = new Hono()

  app.post('/', async (c) => {
    if (!secret) return c.json({ error: 'not_found', message: 'Not found.' }, 404)
    if (!secretMatches(c.req.header('X-Webhook-Secret'), secret)) {
      return c.json({ error: 'unauthorized', message: 'The webhook secret is missing or wrong.' }, 401)
    }
    const body: unknown = await c.req.json().catch(() => null)
    const entry = readZohoEntry(body)
    if (!entry) {
      // The keys show a field mapped wrong in Zoho; the values are someone's request, and stay out of the log.
      const keys =
        body && typeof body === 'object' && !Array.isArray(body)
          ? Object.keys(body).slice(0, 30).join(', ') || '(none)'
          : '(not a JSON object)'
      console.warn(`Maintenance webhook: refused an entry with no description. Keys received: ${keys}`)
      return c.json({ error: 'invalid_entry', message: 'The entry has no description.' }, 400)
    }
    const { id, duplicate } = createMaintenanceRequest(db, null, entry)
    return duplicate ? c.json({ id, duplicate }) : c.json({ id }, 201)
  })

  return app
}
