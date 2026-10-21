import type { ZodError } from 'zod'

/** The first problem found in a row of an import, as a phrase that names the column the way the person knows it. */
export function describeRowProblem(error: ZodError, columns: Record<string, string>): string {
  const issue = error.issues[0]!
  const key = String(issue.path[0])
  const column = columns[key] ?? key
  return issue.code === 'too_big'
    ? `${column} is longer than ${issue.maximum} characters`
    : `${column}: ${issue.message}`
}
