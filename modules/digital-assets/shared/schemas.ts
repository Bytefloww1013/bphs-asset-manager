import { z } from 'zod'
import { id, requiredText } from '#shared/schemas.ts'
import { looksLikeSecret } from './secrets.ts'

// ---- Digital assets -------------------------------------------------------------
// Which account or licence the seat is. Never the way into it: see `looksLikeSecret` for what is caught and what cannot be.
export const digitalAccount = requiredText(200, 'License/Account').refine(
  (value) => !looksLikeSecret(value),
  'Enter the email address or license reference only, never a password or key.',
)

export const digitalAssetCreateSchema = z.object({
  typeId: id,
  account: digitalAccount,
  /** The employee to issue it to straight away, dated today. */
  employeeId: id.nullable().optional(),
})
export type DigitalAssetCreateInput = z.infer<typeof digitalAssetCreateSchema>

export const digitalAssetUpdateSchema = z.object({
  typeId: id.optional(),
  account: digitalAccount.optional(),
})
export type DigitalAssetUpdateInput = z.infer<typeof digitalAssetUpdateSchema>

// Issued today unless an earlier moment is given. It is an instant, not a date: which day that is depends on the viewer's time
// zone, which only their browser knows. The server refuses one that has not happened yet.
export const digitalIssueSchema = z.object({
  employeeId: id,
  issuedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
export type DigitalIssueInput = z.infer<typeof digitalIssueSchema>

// Names the assignment the person was looking at, not just the seat: by the time they confirm, the seat may be with someone else.
export const digitalUnassignSchema = z.object({ assignmentId: id })
export type DigitalUnassignInput = z.infer<typeof digitalUnassignSchema>
