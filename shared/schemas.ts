import { z } from 'zod'
import { SECTION_LABEL, SECTIONS, levelsFor, type Section } from './constants.ts'
import { isStrongPassword } from './password.ts'

export const id = z.number().int().positive()
// A length rule says which field it is about, because the same words are shown under that field in the form.
export const tooLong = (label: string, max: number) => `${label} can be at most ${max} characters`
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong(label, max))
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
export const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, 'Required').max(max, tooLong(label, max))

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
  currentPassword: z
    .string()
    .min(1, 'Enter your current password')
    .max(MAX_PASSWORD, tooLong('Current password', MAX_PASSWORD)),
  newPassword: password,
})
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

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
/** A lookup list of names that can be archived: asset types and brands, digital asset types and grievance categories. */
export const namedListCreateSchema = z.object({ name: requiredText(60, 'Name') })
export const namedListUpdateSchema = z.object({
  name: requiredText(60, 'Name').optional(),
  isActive: z.boolean().optional(),
})

// ---- Records ----------------------------------------------------------------------
// What the kernel's record pages (a grievance's, a review's) share: the dates, the title and description, the notes and reasons,
// and an entry's text and time. Each module builds its own schemas from these.
const pad = (n: number) => String(n).padStart(2, '0')
/** Today as `YYYY-MM-DD`, on the clock of whichever side is asking. */
export const localToday = (now: Date = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// A calendar date, not an instant: it is stored as the text that was entered, so no time zone can move it to another day.
export const calendarDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }, 'Enter a real date')

export const RECORD_TITLE_MAX = 150
export const RECORD_SHORT_DESCRIPTION_MAX = 300
// The body's own limit counts characters of text and is checked once it is sanitised. This one only bounds the markup around it.
export const BODY_HTML_MAX = 1_000_000

/** A note on a change to a record, or the reason for one. Plain text; it becomes the body of the automatic timeline entry. */
export const RECORD_NOTE_MAX = 2000
export const recordNote = z
  .string()
  .trim()
  .max(RECORD_NOTE_MAX, `Keep the note to ${RECORD_NOTE_MAX} characters or fewer`)
  .default('')

/** Why a record is voided, or a file on it withdrawn. */
export const recordReasonSchema = z.object({ reason: requiredText(RECORD_NOTE_MAX, 'Reason') })
export type RecordReasonInput = z.infer<typeof recordReasonSchema>

/** How far ahead of the server's clock "now" on someone's machine may be before it counts as the future. */
const CLOCK_SLACK_MS = 5 * 60_000

export const entryText = {
  title: requiredText(RECORD_TITLE_MAX, 'Title'),
  shortDescription: requiredText(RECORD_SHORT_DESCRIPTION_MAX, 'Short description'),
  /** The details as HTML from the editor, or nothing. The server sanitises it and never stores what it was sent. */
  body: z.string().max(BODY_HTML_MAX, 'This is too long').default(''),
}

/** An instant, as ISO text. The form gives it in local time and the page converts it. */
export const occurredAt = z.iso
  .datetime({ offset: true, error: 'Enter the date and time it happened' })
  .refine((value) => Date.parse(value) <= Date.now() + CLOCK_SLACK_MS, 'This cannot be in the future')

// ---- Users ------------------------------------------------------------------------
// Every section offers the shared levels, so a level a section refuses is Assign: said with the sections that offer it.
const ASSIGN_SECTIONS = SECTIONS.filter((section) => levelsFor(section).includes('assign'))
/** None is left out rather than stored. */
export const accessSchema = z
  .partialRecord(z.enum(SECTIONS), z.enum(['read', 'assign', 'edit', 'full']))
  .refine(
    (access) => Object.entries(access).every(([section, level]) => levelsFor(section as Section).includes(level)),
    ASSIGN_SECTIONS.length
      ? `Assign is a level in ${ASSIGN_SECTIONS.map((section) => SECTION_LABEL[section]).join(', ')} only.`
      : 'No section offers Assign.',
  )

export const userCreateSchema = z.object({
  name: requiredText(120, 'Name'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  access: accessSchema,
  superAdmin: z.boolean(),
  /** Every account belongs to one employee. Only the first account, made on first run, may have none. */
  employeeId: z.number({ error: 'Choose the employee this account belongs to' }).int().positive(),
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  name: requiredText(120, 'Name').optional(),
  access: accessSchema.optional(),
  superAdmin: z.boolean().optional(),
  employeeId: id.nullable().optional(),
})
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
