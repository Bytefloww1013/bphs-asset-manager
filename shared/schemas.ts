import { z } from 'zod'
import { AUDIT_ACTIONS, ROLES } from './constants.ts'
import { isStrongPassword } from './password.ts'

const id = z.number().int().positive()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max)

export const password = z
  .string()
  .refine(isStrongPassword, 'Use at least 8 characters with upper and lower case, a number and a special character.')

// ---- Auth ---------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
})
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

// ---- Assets ---------------------------------------------------------------------
export const assetTag = z
  .string()
  .trim()
  .min(1, 'Enter an asset tag')
  .max(40)
  .transform((value) => value.toUpperCase())

export const assetCreateSchema = z.object({
  tag: assetTag,
  typeId: id,
  serial: optionalText(80),
  conditionRatingId: id,
  holderId: id.nullable().optional(),
  assessedById: id.nullable().optional(),
  notes: optionalText(1000),
})
export type AssetCreateInput = z.infer<typeof assetCreateSchema>

export const assetUpdateSchema = z.object({
  tag: assetTag.optional(),
  typeId: id.optional(),
  serial: optionalText(80),
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
    .min(1)
    .max(500),
})
export type AssetBulkInput = z.infer<typeof assetBulkSchema>

// Each pasted row is checked on its own, so a bad row is reported without refusing the rest. The tag and serial keep the
// limits of Add asset; type, condition and holder are looked up by name and need none.
export const assetBulkRowFields = assetCreateSchema.pick({ tag: true, serial: true })

// ---- Assignments ----------------------------------------------------------------
export const issueSchema = z.object({
  assetId: id,
  employeeId: id,
  conditionRatingId: id,
  assessedById: id.nullable().optional(),
  notes: optionalText(1000),
})
export type IssueInput = z.infer<typeof issueSchema>

export const returnSchema = z.object({
  conditionRatingId: id,
  assessedById: id.nullable().optional(),
  notes: optionalText(1000),
})
export type ReturnInput = z.infer<typeof returnSchema>

export const returnBulkSchema = returnSchema.extend({
  ids: z.array(id).min(1).max(200),
})
export type ReturnBulkInput = z.infer<typeof returnBulkSchema>

// ---- Employees ------------------------------------------------------------------
export const employeeCreateSchema = z.object({
  code: requiredText(40),
  firstName: requiredText(80),
  lastName: requiredText(80),
  department: optionalText(80),
  jobTitle: optionalText(120),
})
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>

export const employeeUpdateSchema = employeeCreateSchema.partial()
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>

export const importSchema = z.object({
  csv: z.string().min(1, 'Choose a file').max(2_000_000, 'File is larger than 2 MB'),
})
export type ImportInput = z.infer<typeof importSchema>

// ---- Lists ------------------------------------------------------------------------
export const assetTypeCreateSchema = z.object({ name: requiredText(60) })
export const assetTypeUpdateSchema = z.object({
  name: requiredText(60).optional(),
  isActive: z.boolean().optional(),
})

export const ratingCreateSchema = z.object({ name: requiredText(40) })
export const ratingUpdateSchema = z.object({
  name: requiredText(40).optional(),
  isActive: z.boolean().optional(),
})
export const ratingOrderSchema = z.object({ ids: z.array(id).min(1) })

// ---- Users ------------------------------------------------------------------------
export const userCreateSchema = z.object({
  name: requiredText(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  role: z.enum(ROLES),
  employeeId: id.nullable().optional(),
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  name: requiredText(120).optional(),
  role: z.enum(ROLES).optional(),
  employeeId: id.nullable().optional(),
})
export type UserUpdateInput = z.infer<typeof userUpdateSchema>

// ---- Audit ------------------------------------------------------------------------
export const auditQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type AuditQuery = z.infer<typeof auditQuerySchema>
