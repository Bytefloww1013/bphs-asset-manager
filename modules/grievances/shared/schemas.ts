import { auditQuerySchema } from '#foundation/audit/shared/index.ts'
import { z } from 'zod'
import {
  BODY_HTML_MAX,
  calendarDate,
  entryText,
  id,
  localToday,
  namedListCreateSchema,
  namedListUpdateSchema,
  occurredAt,
  RECORD_NOTE_MAX,
  RECORD_SHORT_DESCRIPTION_MAX,
  RECORD_TITLE_MAX,
  recordNote as note,
  recordReasonSchema,
  requiredText,
  type RecordReasonInput,
} from '#shared/schemas.ts'
import { GRIEVANCE_AUDIT_ACTIONS, GRIEVANCE_STATUSES } from './constants.ts'

export const grievanceCategoryCreateSchema = namedListCreateSchema
export const grievanceCategoryUpdateSchema = namedListUpdateSchema

/** More people than any grievance names; it only keeps a request from listing the whole directory. */
const GRIEVANCE_PEOPLE_MAX = 50

const people = (missing: string) =>
  z
    .array(id, { error: missing })
    .min(1, missing)
    .max(GRIEVANCE_PEOPLE_MAX, `At most ${GRIEVANCE_PEOPLE_MAX} people can be named here`)
    .transform((ids) => [...new Set(ids)])

const grievanceFields = {
  title: requiredText(RECORD_TITLE_MAX, 'Title'),
  shortDescription: requiredText(RECORD_SHORT_DESCRIPTION_MAX, 'Short description'),
  /** The body as HTML from the editor. The server sanitises it and never stores what it was sent. */
  body: z
    .string({ error: 'Write the grievance before saving' })
    .min(1, 'Write the grievance before saving')
    .max(BODY_HTML_MAX, 'The grievance is too long'),
  dateMade: calendarDate('date the grievance was made').refine(
    (value) => value <= localToday(),
    'The date made cannot be in the future',
  ),
  categoryId: z.number({ error: 'Choose a category' }).int().positive(),
  employeeIds: people('Choose at least one employee involved'),
  managementIds: people('Choose at least one person from management'),
}

const notInBothLists = (value: { employeeIds: number[]; managementIds: number[] }, ctx: z.RefinementCtx) => {
  if (value.employeeIds.some((employee) => value.managementIds.includes(employee))) {
    ctx.addIssue({
      code: 'custom',
      path: ['managementIds'],
      message: 'Nobody can be in both Employees Involved and Management Involved',
    })
  }
}

export const grievanceCreateSchema = z
  .object({ ...grievanceFields, ownerId: z.number({ error: 'Choose an owner' }).int().positive() })
  .superRefine(notInBothLists)
export type GrievanceCreateInput = z.infer<typeof grievanceCreateSchema>

/** Voiding is not one of these: it has its own request, its own permission and no way back. */
export const GRIEVANCE_OPEN_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const

export const grievanceStatusChangeSchema = z
  .object({ status: z.enum(GRIEVANCE_OPEN_STATUSES, { error: 'Choose a status' }), note })
  .superRefine((value, ctx) => {
    if (value.status === 'closed' && !value.note)
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say why it is being closed' })
  })
export type GrievanceStatusChangeInput = z.infer<typeof grievanceStatusChangeSchema>

export const grievanceOwnerChangeSchema = z.object({
  ownerId: z.number({ error: 'Choose an owner' }).int().positive(),
  note,
})
export type GrievanceOwnerChangeInput = z.infer<typeof grievanceOwnerChangeSchema>

/**
 * An edit: everything the create form takes but the owner, who is changed by an action of their own. `version` is the one the
 * editor loaded, so that a save made over someone else's is refused.
 */
export const grievanceUpdateSchema = z
  .object({
    ...grievanceFields,
    version: z.number().int().positive(),
    reason: requiredText(RECORD_NOTE_MAX, 'Reason for change'),
  })
  .superRefine(notInBothLists)
export type GrievanceUpdateInput = z.infer<typeof grievanceUpdateSchema>

export const grievanceVoidSchema = recordReasonSchema
export type GrievanceVoidInput = RecordReasonInput

export const grievanceAttachmentWithdrawSchema = recordReasonSchema
export type GrievanceAttachmentWithdrawInput = RecordReasonInput

/** An export the browser makes, reported so that it is logged. */
export const grievanceExportSchema = z.object({ format: z.enum(['pdf', 'xlsx']) })
export type GrievanceExportInput = z.infer<typeof grievanceExportSchema>

export const grievanceEntryCreateSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.enum(['action', 'event']),
      occurredAt,
      ...entryText,
    }),
    // A correction happens when it is written, so it is not asked when; it says which entry it corrects, by number.
    z.object({
      kind: z.literal('correction'),
      correctsSeq: z.number({ error: 'Say which entry this corrects' }).int().positive(),
      ...entryText,
    }),
  ],
  { error: 'Choose Action, Event or Correction' },
)
export type GrievanceEntryCreateInput = z.infer<typeof grievanceEntryCreateSchema>

// `from` and `to` are days, both inclusive, and are compared with Date Made, which is a day too: no time zone comes into it.
export const grievanceListQuerySchema = z.object({
  status: z.enum([...GRIEVANCE_STATUSES, 'all']).default('all'),
  owner: z.coerce.number().int().positive().optional(),
  category: z.coerce.number().int().positive().optional(),
  from: calendarDate('start date').optional(),
  to: calendarDate('end date').optional(),
  q: z.string().trim().max(100).optional(),
})
export type GrievanceListQuery = z.infer<typeof grievanceListQuerySchema>

/** The Grievance Audit Log takes the Audit Log's filters, over its own actions. */
export const grievanceAuditQuerySchema = auditQuerySchema.extend({ action: z.enum(GRIEVANCE_AUDIT_ACTIONS).optional() })
export type GrievanceAuditQuery = z.infer<typeof grievanceAuditQuerySchema>
