import { auditQuerySchema } from '#foundation/audit/shared/index.ts'
import { z } from 'zod'
import {
  BODY_HTML_MAX,
  calendarDate,
  entryText,
  localToday,
  occurredAt,
  RECORD_TITLE_MAX,
  recordNote,
  recordReasonSchema,
  requiredText,
  tooLong,
  type RecordReasonInput,
} from '#shared/schemas.ts'
import { REVIEW_AUDIT_ACTIONS, REVIEW_CAP_STATUSES, REVIEW_STATUSES } from './constants.ts'

export const REVIEW_SUMMARY_MAX = 300
export const REVIEW_FINDINGS_MAX = 2000

const reviewFields = {
  title: requiredText(RECORD_TITLE_MAX, 'Title'),
  summary: requiredText(REVIEW_SUMMARY_MAX, 'Summary'),
  reviewDate: calendarDate('review date').refine(
    (value) => value <= localToday(),
    'The review date cannot be in the future',
  ),
  reviewerId: z.number({ error: 'Choose who conducted the review' }).int().positive(),
  employeeId: z.number({ error: 'Choose the employee reviewed' }).int().positive(),
  findings: z.string().trim().max(REVIEW_FINDINGS_MAX, tooLong('Findings', REVIEW_FINDINGS_MAX)).default(''),
  /** The Review body as HTML from the editor, or nothing yet. The server sanitises it and never stores what it was sent. */
  body: z.string().max(BODY_HTML_MAX, 'The review body is too long').default(''),
}

const notTheReviewer = (value: { reviewerId: number; employeeId: number }, ctx: z.RefinementCtx) => {
  if (value.reviewerId === value.employeeId)
    ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'The employee reviewed cannot also be the reviewer' })
}

export const reviewCreateSchema = z.object(reviewFields).superRefine(notTheReviewer)
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>

/** An edit: every field, and the version the editor loaded, so that a save made over someone else's is refused. */
export const reviewUpdateSchema = z
  .object({ ...reviewFields, version: z.number().int().positive() })
  .superRefine(notTheReviewer)
export type ReviewUpdateInput = z.infer<typeof reviewUpdateSchema>

export const reviewEntryCreateSchema = z.discriminatedUnion(
  'kind',
  [
    // `capSeq` files the update under one of the review's CAPs. A correction goes wherever the entry it corrects is.
    z.object({ kind: z.literal('update'), occurredAt, capSeq: z.number().int().positive().optional(), ...entryText }),
    z.object({
      kind: z.literal('correction'),
      correctsSeq: z.number({ error: 'Say which entry this corrects' }).int().positive(),
      ...entryText,
    }),
  ],
  { error: 'Choose Update or Correction' },
)
export type ReviewEntryCreateInput = z.infer<typeof reviewEntryCreateSchema>

const capFields = {
  ...entryText,
  responsibleId: z.number({ error: 'Choose who is responsible' }).int().positive(),
  /** Optional. Nothing is ever marked overdue; the date is kept for the notifications planned later. */
  dueDate: calendarDate('due date').nullable().default(null),
}

/** A new CAP. It starts as Not started. */
export const reviewCapCreateSchema = z.object(capFields)
export type ReviewCapCreateInput = z.infer<typeof reviewCapCreateSchema>

/** An edit, with the version the editor loaded, so that a save made over someone else's is refused. */
export const reviewCapUpdateSchema = z.object({ ...capFields, version: z.number().int().positive() })
export type ReviewCapUpdateInput = z.infer<typeof reviewCapUpdateSchema>

export const reviewCapStatusSchema = z
  .object({
    status: z.enum(REVIEW_CAP_STATUSES, { error: 'Choose a status' }),
    note: recordNote,
    version: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'cancelled' && !value.note)
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say why it is being cancelled' })
  })
export type ReviewCapStatusInput = z.infer<typeof reviewCapStatusSchema>

/** Voiding is not one of these, as with grievances: it has its own request, needs Full and has no way back. */
export const REVIEW_OPEN_STATUSES = ['open', 'in_progress', 'completed'] as const

export const reviewStatusChangeSchema = z.object({
  status: z.enum(REVIEW_OPEN_STATUSES, { error: 'Choose a status' }),
  note: recordNote,
})
export type ReviewStatusChangeInput = z.infer<typeof reviewStatusChangeSchema>

export const reviewVoidSchema = recordReasonSchema
export type ReviewVoidInput = RecordReasonInput

/** Files added on their own, to the review or, with `capSeq`, to one of its CAPs. */
export const reviewAttachmentsSchema = z.object({ capSeq: z.number().int().positive().optional() })
export type ReviewAttachmentsInput = z.infer<typeof reviewAttachmentsSchema>

export const reviewAttachmentWithdrawSchema = recordReasonSchema
export type ReviewAttachmentWithdrawInput = RecordReasonInput

/** Reported by the Action items page when it saves the list, since the browser makes the file. */
export const reviewActionItemsExportSchema = z.object({
  format: z.enum(['csv', 'xlsx']),
  rows: z.number().int().min(0),
})
export type ReviewActionItemsExportInput = z.infer<typeof reviewActionItemsExportSchema>

// `from` and `to` are days, both inclusive, compared with the review date.
export const reviewListQuerySchema = z.object({
  status: z.enum([...REVIEW_STATUSES, 'all']).default('all'),
  reviewer: z.coerce.number().int().positive().optional(),
  employee: z.coerce.number().int().positive().optional(),
  from: calendarDate('start date').optional(),
  to: calendarDate('end date').optional(),
  q: z.string().trim().max(100).optional(),
})
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>

/** The Review Audit Log takes the Audit Log's filters, over its own actions. */
export const reviewAuditQuerySchema = auditQuerySchema.extend({ action: z.enum(REVIEW_AUDIT_ACTIONS).optional() })
export type ReviewAuditQuery = z.infer<typeof reviewAuditQuerySchema>
