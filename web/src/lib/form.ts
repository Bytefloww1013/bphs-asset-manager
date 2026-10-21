import type { AnyFieldApi } from '@tanstack/react-form'
import type { ZodError } from 'zod'
import { ApiError } from './api.ts'

/** First validation message for a field, shown once the user has touched it or tried to submit. */
export function fieldError(
  field: AnyFieldApi,
  serverFields?: Record<string, string>,
  submitted = false,
): string | null {
  const server = serverFields?.[field.name]
  if (server) return server
  if (!field.state.meta.isTouched && !submitted) return null
  const first = field.state.meta.errors[0] as unknown
  if (!first) return null
  if (typeof first === 'string') return first
  return (first as { message?: string }).message ?? 'This value is not valid.'
}

/** The first message for each field a shared schema refused, in the shape a form validator hands back. */
export function fieldMessages(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) fields[issue.path.join('.') || '_'] ??= issue.message
  return fields
}

/** Turn a failed API call into a message for the form's alert and messages for individual fields. */
export function splitApiError(error: unknown): { message: string; fields: Record<string, string>; code?: string } {
  if (error instanceof ApiError) {
    return { message: error.message, fields: error.fields, code: error.code }
  }
  return { message: 'Something went wrong. Please try again.', fields: {} }
}
