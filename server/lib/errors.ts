/** An error that names one field also carries its message in `fields`, where a failed validation puts every field's. */
function withFields(message: string, details: unknown): unknown {
  const named = details as { field?: unknown; fields?: unknown } | null | undefined
  if (typeof named?.field !== 'string' || named.fields) return details
  return { ...named, fields: { [named.field]: message } }
}

export class HttpError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = withFields(message, details)
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found.`)
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details)
export const forbidden = (message = 'You do not have permission to do this.') =>
  new HttpError(403, 'forbidden', message)
export const invalid = (message: string, details?: unknown) =>
  new HttpError(422, 'validation_failed', message, details)
