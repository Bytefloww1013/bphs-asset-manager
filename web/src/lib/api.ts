import type { ApiErrorBody } from '@shared/types.ts'

export class ApiError extends Error {
  status: number
  code: string
  details?: any

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.message ?? fallback)
    this.status = status
    this.code = body?.error ?? 'error'
    this.details = body?.details
  }

  /** Field-level messages from a 422, keyed by field name. */
  get fields(): Record<string, string> {
    return (this.details?.fields as Record<string, string> | undefined) ?? {}
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  const form = body instanceof FormData
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      // Writes are JSON, or multipart where they carry files (the browser sets that type and its boundary); the server checks the Origin of a multipart post.
      headers: method === 'GET' || form ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : form ? body : JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, null, 'Cannot reach the server. Check your connection and try again.')
  }
  if (response.status === 204) return undefined as T
  const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null
  if (!response.ok) throw new ApiError(response.status, data as ApiErrorBody | null, 'The request failed.')
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = void>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
