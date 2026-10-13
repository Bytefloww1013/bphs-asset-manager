import { z } from 'zod'
import { AUDIT_ACTIONS, RATING_SCORE_MAX, RATING_SCORE_MIN, ROLES } from './constants.ts'
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

// ---- Users ------------------------------------------------------------------------
export const userCreateSchema = z.object({
  name: requiredText(120, 'Name'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  role: z.enum(ROLES),
  employeeId: id.nullable().optional(),
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  name: requiredText(120, 'Name').optional(),
  role: z.enum(ROLES).optional(),
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
