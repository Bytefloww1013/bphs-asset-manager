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

/**
 * What a client is told about any error. An HttpError speaks for itself; a database constraint the checks did not foresee is a
 * conflict; anything else is a fault of ours, which the caller logs. Used for a whole request and for one row of a bulk request.
 */
export function describeError(error: unknown): { status: number; code: string; message: string; details?: unknown } {
  if (error instanceof HttpError)
    return { status: error.status, code: error.code, message: error.message, details: error.details }
  const code = (error as { code?: string } | null)?.code ?? ''
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error instanceof Error &&
    /assignments\.kind, assignments\.item_id/.test(error.message)
  ) {
    return { status: 409, code: 'asset_already_assigned', message: 'This asset is already assigned.' }
  }
  if (code.startsWith('SQLITE_CONSTRAINT'))
    return { status: 409, code: 'conflict', message: 'That change conflicts with existing records.' }
  return { status: 500, code: 'internal_error', message: 'Something went wrong on the server.' }
}

/**
 * For one row of a bulk request: the sentence to report for it. The row is its own transaction, so the rows before it are already
 * saved and the rows after it can still be; throwing here would hide both from the answer. Only the first fault of ours is logged.
 */
export function rowFailure(error: unknown, log: { done: boolean }): string {
  const problem = describeError(error)
  if (problem.status >= 500 && !log.done) {
    log.done = true
    console.error(error)
  }
  return problem.message
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found.`)
export const conflict = (code: string, message: string, details?: unknown) => new HttpError(409, code, message, details)
export const forbidden = (message = 'You do not have permission to do this.') =>
  new HttpError(403, 'forbidden', message)
export const invalid = (message: string, details?: unknown) => new HttpError(422, 'validation_failed', message, details)
