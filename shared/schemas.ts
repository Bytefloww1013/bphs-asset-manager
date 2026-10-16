import { z } from 'zod'
import { AUDIT_ACTIONS, GRIEVANCE_AUDIT_ACTIONS, GRIEVANCE_STATUSES, MAINTENANCE_DESCRIPTION_MAX, MAINTENANCE_NOTE_MAX, MAINTENANCE_STATUSES, RATING_SCORE_MAX, RATING_SCORE_MIN, SECTIONS } from './constants.ts'
import { isStrongPassword } from './password.ts'
import { looksLikeSecret } from './secrets.ts'

const id = z.number().int().positive()
// A length rule says which field it is about, because the same words are shown under that field in the form.
const tooLong = (label: string, max: number) => `${label} can be at most ${max} characters`
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong(label, max))
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
const requiredText = (max: number, label: string) => z.string().trim().min(1, 'Required').max(max, tooLong(label, max))

// The server hashes whatever it is sent before it can say no, so a password has a ceiling; nobody types anything near it.
const MAX_PASSWORD = 256

export const password = z
  .string()
  .max(MAX_PASSWORD, tooLong('Password', MAX_PASSWORD))
  .refine(isStrongPassword, 'Use at least 8 characters with upper and lower case, a number and a special character.')

// ---- Auth ---------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD, tooLong('Password', MAX_PASSWORD)),
  remember: z.boolean().optional(),
})
export type LoginInput = z.infer<typeof loginSchema>

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(MAX_PASSWORD, tooLong('Current password', MAX_PASSWORD)),
  newPassword: password,
})
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

// ---- Assets ---------------------------------------------------------------------
// A tag is typed, printed on a label and used as the address of the asset's page, so it keeps to characters that survive all three.
// One made only of dots cannot be an address at all: "." and ".." in a URL mean "here" and "one level up".
export const assetTag = z
  .string()
  .trim()
  .min(1, 'Enter an asset tag')
  .max(40, tooLong('Asset tag', 40))
  .regex(/^[A-Za-z0-9 ._-]+$/, 'Asset tag can only contain letters, digits, spaces, hyphens, underscores and dots')
  .refine((value) => !/^\.+$/.test(value), 'Asset tag cannot be only dots')
  .transform((value) => value.toUpperCase())

const assetCreateFields = z.object({
  tag: assetTag,
  typeId: id,
  serial: optionalText(80, 'Serial number'),
  conditionRatingId: id,
  /** The employee to issue it to straight away. */
  holderId: id.nullable().optional(),
  /** The program to assign it to straight away. An asset starts with one holder or none. */
  programId: id.nullable().optional(),
  assessedById: id.nullable().optional(),
  notes: optionalText(1000, 'Notes'),
})
export const assetCreateSchema = assetCreateFields.refine((value) => !(value.holderId && value.programId), {
  path: ['programId'],
  message: 'Choose an employee or a program, not both',
})
export type AssetCreateInput = z.infer<typeof assetCreateSchema>

export const assetUpdateSchema = z.object({
  tag: assetTag.optional(),
  typeId: id.optional(),
  serial: optionalText(80, 'Serial number'),
})
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>

export const assetBulkSchema = z.object({
  rows: z
    .array(
      z.object({
        tag: z.string().trim(),
        type: z.string().trim(),
        serial: z.string().trim().optional(),
        condition: z.string().trim().optional(),
        holder: z.string().trim().optional(),
      }),
    )
    .min(1, 'Paste at least one row')
    .max(500, 'Paste at most 500 rows at a time'),
})
export type AssetBulkInput = z.infer<typeof assetBulkSchema>

// Each pasted row is checked on its own, so a bad row is reported without refusing the rest. The tag and serial keep the
// limits of Add asset; type, condition and holder are looked up by name and need none.
export const assetBulkRowFields = assetCreateFields.pick({ tag: true, serial: true })

// ---- Assignments ----------------------------------------------------------------
// An asset is issued to an employee or assigned to a program: exactly one of the two.
export const issueSchema = z
  .object({
    assetId: id,
    employeeId: id.nullable().optional(),
    programId: id.nullable().optional(),
    conditionRatingId: id,
    assessedById: id.nullable().optional(),
    notes: optionalText(1000, 'Notes'),
  })
  .refine((value) => !(value.employeeId && value.programId), { path: ['programId'], message: 'Choose an employee or a program, not both' })
  .refine((value) => value.employeeId || value.programId, { path: ['employeeId'], message: 'Choose an employee or a program' })
export type IssueInput = z.infer<typeof issueSchema>

export const returnSchema = z.object({
  conditionRatingId: id,
  assessedById: id.nullable().optional(),
  notes: optionalText(1000, 'Notes'),
})
export type ReturnInput = z.infer<typeof returnSchema>

export const returnBulkSchema = returnSchema.extend({
  ids: z.array(id).min(1).max(200),
})
export type ReturnBulkInput = z.infer<typeof returnBulkSchema>

// ---- Employees ------------------------------------------------------------------
export const employeeCreateSchema = z.object({
  code: requiredText(40, 'Employee ID'),
  firstName: requiredText(80, 'First name'),
  lastName: requiredText(80, 'Last name'),
  department: optionalText(80, 'Department'),
  jobTitle: optionalText(120, 'Job title'),
})
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>

export const employeeUpdateSchema = employeeCreateSchema.partial()
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>

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

// ---- Programs -------------------------------------------------------------------
export const programCreateSchema = z.object({
  code: requiredText(40, 'Program ID'),
  name: requiredText(120, 'Program name'),
  address: optionalText(240, 'Program address'),
})
export type ProgramCreateInput = z.infer<typeof programCreateSchema>

export const programUpdateSchema = programCreateSchema.partial()
export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>

// ---- Import -----------------------------------------------------------------------
export const IMPORT_MAX_ROWS = 2000
/** No field of an importable record is this long, so a cell cut to this length still fails its own check, with a message for its row. */
export const IMPORT_MAX_CELL = 300

// The browser reads the file and maps its columns; what arrives here is plain text keyed by field.
export const importSchema = z.object({
  rows: z
    .array(
      z.object({
        row: z.number().int().min(1).max(10_000_000),
        values: z.record(z.string().max(40), z.string().max(IMPORT_MAX_CELL)),
      }),
    )
    .min(1, 'The file has no rows to import')
    .max(IMPORT_MAX_ROWS, `A file can hold at most ${IMPORT_MAX_ROWS.toLocaleString('en-US')} rows`),
})
export type ImportInput = z.infer<typeof importSchema>

// ---- Lists ------------------------------------------------------------------------
export const assetTypeCreateSchema = z.object({ name: requiredText(60, 'Name') })
export const assetTypeUpdateSchema = z.object({
  name: requiredText(60, 'Name').optional(),
  isActive: z.boolean().optional(),
})

/** Grievance categories follow the same rules as the asset type lists. */
export const grievanceCategoryCreateSchema = assetTypeCreateSchema
export const grievanceCategoryUpdateSchema = assetTypeUpdateSchema

const ratingScore = z
  .number({ error: 'Give the rating a score from 1 to 100.' })
  .int('The score must be a whole number from 1 to 100.')
  .min(RATING_SCORE_MIN, 'The score must be a whole number from 1 to 100.')
  .max(RATING_SCORE_MAX, 'The score must be a whole number from 1 to 100.')
export const ratingCreateSchema = z.object({ name: requiredText(40, 'Name'), score: ratingScore })
export const ratingUpdateSchema = z.object({
  name: requiredText(40, 'Name').optional(),
  score: ratingScore.optional(),
  isActive: z.boolean().optional(),
})

// ---- Grievances -------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0')
/** Today as `YYYY-MM-DD`, on the clock of whichever side is asking. */
export const localToday = (now: Date = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// A calendar date, not an instant: it is stored as the text that was entered, so no time zone can move it to another day.
const calendarDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }, 'Enter a real date')

export const GRIEVANCE_TITLE_MAX = 150
export const GRIEVANCE_SHORT_DESCRIPTION_MAX = 300
/** More people than any grievance names; it only keeps a request from listing the whole directory. */
const GRIEVANCE_PEOPLE_MAX = 50
// The body's own limit counts characters of text and is checked once it is sanitised. This one only bounds the markup around it.
const BODY_HTML_MAX = 1_000_000

const people = (missing: string) =>
  z
    .array(id, { error: missing })
    .min(1, missing)
    .max(GRIEVANCE_PEOPLE_MAX, `At most ${GRIEVANCE_PEOPLE_MAX} people can be named here`)
    .transform((ids) => [...new Set(ids)])

const grievanceFields = {
  title: requiredText(GRIEVANCE_TITLE_MAX, 'Title'),
  shortDescription: requiredText(GRIEVANCE_SHORT_DESCRIPTION_MAX, 'Short description'),
  /** The body as HTML from the editor. The server sanitises it and never stores what it was sent. */
  body: z.string({ error: 'Write the grievance before saving' }).min(1, 'Write the grievance before saving').max(BODY_HTML_MAX, 'The grievance is too long'),
  dateMade: calendarDate('date the grievance was made').refine((value) => value <= localToday(), 'The date made cannot be in the future'),
  categoryId: z.number({ error: 'Choose a category' }).int().positive(),
  employeeIds: people('Choose at least one employee involved'),
  managementIds: people('Choose at least one person from management'),
}

const notInBothLists = (value: { employeeIds: number[]; managementIds: number[] }, ctx: z.RefinementCtx) => {
  if (value.employeeIds.some((employee) => value.managementIds.includes(employee))) {
    ctx.addIssue({ code: 'custom', path: ['managementIds'], message: 'Nobody can be in both Employees Involved and Management Involved' })
  }
}

export const grievanceCreateSchema = z.object({ ...grievanceFields, ownerId: z.number({ error: 'Choose an owner' }).int().positive() }).superRefine(notInBothLists)
export type GrievanceCreateInput = z.infer<typeof grievanceCreateSchema>

/** A note on a change to a grievance, or the reason for one. Plain text; it becomes the body of the automatic timeline entry. */
export const GRIEVANCE_NOTE_MAX = 2000
const note = z.string().trim().max(GRIEVANCE_NOTE_MAX, `Keep the note to ${GRIEVANCE_NOTE_MAX} characters or fewer`).default('')

/** Voiding is not one of these: it has its own request, its own permission and no way back. */
export const GRIEVANCE_OPEN_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const

export const grievanceStatusChangeSchema = z
  .object({ status: z.enum(GRIEVANCE_OPEN_STATUSES, { error: 'Choose a status' }), note })
  .superRefine((value, ctx) => {
    if (value.status === 'closed' && !value.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say why it is being closed' })
  })
export type GrievanceStatusChangeInput = z.infer<typeof grievanceStatusChangeSchema>

export const grievanceOwnerChangeSchema = z.object({ ownerId: z.number({ error: 'Choose an owner' }).int().positive(), note })
export type GrievanceOwnerChangeInput = z.infer<typeof grievanceOwnerChangeSchema>

/**
 * An edit: everything the create form takes but the owner, who is changed by an action of their own. `version` is the one the
 * editor loaded, so that a save made over someone else's is refused.
 */
export const grievanceUpdateSchema = z
  .object({ ...grievanceFields, version: z.number().int().positive(), reason: requiredText(GRIEVANCE_NOTE_MAX, 'Reason for change') })
  .superRefine(notInBothLists)
export type GrievanceUpdateInput = z.infer<typeof grievanceUpdateSchema>

export const grievanceVoidSchema = z.object({ reason: requiredText(GRIEVANCE_NOTE_MAX, 'Reason') })
export type GrievanceVoidInput = z.infer<typeof grievanceVoidSchema>

export const grievanceAttachmentWithdrawSchema = z.object({ reason: requiredText(GRIEVANCE_NOTE_MAX, 'Reason') })
export type GrievanceAttachmentWithdrawInput = z.infer<typeof grievanceAttachmentWithdrawSchema>

/** An export the browser makes, reported so that it is logged. */
export const grievanceExportSchema = z.object({ format: z.enum(['pdf', 'xlsx']) })
export type GrievanceExportInput = z.infer<typeof grievanceExportSchema>

/** How far ahead of the server's clock "now" on someone's machine may be before it counts as the future. */
const CLOCK_SLACK_MS = 5 * 60_000

const entryText = {
  title: requiredText(GRIEVANCE_TITLE_MAX, 'Title'),
  shortDescription: requiredText(GRIEVANCE_SHORT_DESCRIPTION_MAX, 'Short description'),
  /** The details as HTML from the editor, or nothing. The server sanitises it and never stores what it was sent. */
  body: z.string().max(BODY_HTML_MAX, 'This is too long').default(''),
}

export const grievanceEntryCreateSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.enum(['action', 'event']),
      /** An instant, as ISO text. The form gives it in local time and the page converts it. */
      occurredAt: z.iso
        .datetime({ offset: true, error: 'Enter the date and time it happened' })
        .refine((value) => Date.parse(value) <= Date.now() + CLOCK_SLACK_MS, 'This cannot be in the future'),
      ...entryText,
    }),
    // A correction happens when it is written, so it is not asked when; it says which entry it corrects, by number.
    z.object({ kind: z.literal('correction'), correctsSeq: z.number({ error: 'Say which entry this corrects' }).int().positive(), ...entryText }),
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

// ---- Users ------------------------------------------------------------------------
/** None is left out rather than stored. */
export const accessSchema = z.partialRecord(z.enum(SECTIONS), z.enum(['read', 'edit', 'full']))

export const userCreateSchema = z.object({
  name: requiredText(120, 'Name'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  access: accessSchema,
  superAdmin: z.boolean(),
  employeeId: id.nullable().optional(),
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  name: requiredText(120, 'Name').optional(),
  access: accessSchema.optional(),
  superAdmin: z.boolean().optional(),
  employeeId: id.nullable().optional(),
})
export type UserUpdateInput = z.infer<typeof userUpdateSchema>

// ---- Audit ------------------------------------------------------------------------
// `from` and `to` are instants, from inclusive and to exclusive: which day an entry falls on depends on the viewer's time zone,
// which only their browser knows, so the browser says where its days start.
export const auditQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type AuditQuery = z.infer<typeof auditQuerySchema>

/** The Grievance Audit Log takes the same filters, over its own actions. */
export const grievanceAuditQuerySchema = auditQuerySchema.extend({ action: z.enum(GRIEVANCE_AUDIT_ACTIONS).optional() })
export type GrievanceAuditQuery = z.infer<typeof grievanceAuditQuerySchema>

// ---- Maintenance ----------------------------------------------------------------
// A request entered by hand. Zoho's come in through the webhook, which reads them leniently on its own.
export const maintenanceCreateSchema = z.object({
  firstName: requiredText(100, 'First name'),
  lastName: optionalText(100, 'Last name'),
  // Optional, for a request phoned in, but a real address when given.
  email: z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email('Enter a valid email address')])).optional(),
  program: optionalText(100, 'Program'),
  location: requiredText(200, 'Location'),
  description: requiredText(MAINTENANCE_DESCRIPTION_MAX, 'Description'),
  urgent: z.enum(['No', 'Yes']).default('No'),
  noticedDate: calendarDate('date noticed').optional(),
})
export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateSchema>

/** Who the request is dispatched to; null clears it. */
export const maintenanceDispatchSchema = z.object({ employeeId: z.number({ error: 'Choose an employee' }).int().positive().nullable() })
export const maintenanceStatusSchema = z.object({ status: z.enum(MAINTENANCE_STATUSES, { error: 'Choose a status' }) })
export const maintenanceNoteSchema = z.object({ body: requiredText(MAINTENANCE_NOTE_MAX, 'Note') })
