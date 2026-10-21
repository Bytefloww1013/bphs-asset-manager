import { zValidator } from '@hono/zod-validator'
import type { Context, MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'
import type { z, ZodType } from 'zod'
import type { Section } from '../shared/constants.ts'
import { canAt, needsAccess } from '../shared/permissions.ts'
import type { AuthUser } from './services/auth.ts'
import { HttpError, forbidden } from './lib/errors.ts'

export type Env = { Variables: { user: AuthUser; token: string } }

const validationFailed = (c: Context, issues: z.core.$ZodIssue[]) => {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  const first = Object.values(fields)[0] ?? 'The request is not valid.'
  return c.json({ error: 'validation_failed', message: first, details: { fields } }, 422)
}

/** Validate a JSON body; failures come back as 422 with a message per field. */
export function json<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) return validationFailed(c, result.error.issues)
  })
}

const isMultipart = (c: Context) => /^multipart\/form-data/i.test(c.req.header('Content-Type') ?? '')

/**
 * json(), or the same JSON as the `data` field of a multipart body that carries files as well; `formFiles` reads those.
 * A cross-site form can post multipart: the CSRF check's Origin test is what stops it here, not the content type.
 */
export function jsonOrFiles<T extends ZodType>(schema: T) {
  return validator('json', async (value, c) => {
    if (isMultipart(c)) {
      const data = (await c.req.parseBody({ all: true })).data
      try {
        value = typeof data === 'string' ? JSON.parse(data) : {}
      } catch {
        value = {}
      }
    }
    const result = schema.safeParse(value)
    return result.success ? result.data : validationFailed(c, result.error.issues)
  })
}

/** The files of a multipart body, in the `files` field; none for a JSON one. Checking them is the service's job. */
export async function formFiles(c: Context): Promise<File[]> {
  if (!isMultipart(c)) return []
  // Read with the same options as jsonOrFiles: the parsed body is cached whatever they were.
  const files = (await c.req.parseBody({ all: true })).files ?? []
  return [files].flat().filter((file): file is File => file instanceof File)
}

export function query<T extends ZodType>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (result.success) return
    return c.json({ error: 'validation_failed', message: 'The query is not valid.' }, 422)
  })
}

/** Deleting, voiding, withdrawing and archiving: what a Super Admin can do, within one section. */
export function requireFull(section: Section): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!canAt(c.get('user'), section, 'full')) throw forbidden(needsAccess(section, 'full'))
    await next()
  }
}

export const requireSuperAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!c.get('user').superAdmin) throw forbidden('Only a Super Admin can do this.')
  await next()
}

export function intParam(c: Context, name: string): number {
  const value = Number(c.req.param(name))
  if (!Number.isInteger(value) || value <= 0) {
    throw new HttpError(404, 'not_found', 'Not found.')
  }
  return value
}

/** A stored file, always as a download: never shown in the page, and never sniffed into something else, so a file someone added cannot run as part of the app. */
export const sendFile = (c: Context, file: { filename: string; contentType: string; bytes: Buffer }) =>
  c.body(new Uint8Array(file.bytes), 200, {
    'Content-Type': file.contentType,
    'Content-Disposition': contentDisposition(file.filename),
    'X-Content-Type-Options': 'nosniff',
  })

/** Save as, under the file's own name: plain ASCII for old browsers, the exact name (RFC 5987) for the rest. */
export const contentDisposition = (filename: string) =>
  `attachment; filename="${filename.replace(/[^ -~]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}`
