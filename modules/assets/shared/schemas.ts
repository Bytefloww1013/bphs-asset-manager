import { z } from 'zod'
import {
  id,
  namedListCreateSchema,
  namedListUpdateSchema,
  optionalText,
  requiredText,
  tooLong,
} from '#shared/schemas.ts'
import { RATING_SCORE_MAX, RATING_SCORE_MIN } from './constants.ts'

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

// A Microsoft Entra object ID: a UUID in its canonical 8-4-4-4-12 form. Stored lowercase, so the same ID typed in capitals is
// still a duplicate.
export const ENTRA_OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const entraObjectId = z
  .string()
  .trim()
  .refine((value) => value === '' || ENTRA_OBJECT_ID.test(value), {
    message: 'Enter the Entra ObjectId as a GUID, like 4f8c2a1e-9b3d-4c7a-8e21-5d6f0a9b3c47',
  })
  .transform((value) => (value === '' ? null : value.toLowerCase()))
  .nullable()
  .optional()

const assetCreateFields = z.object({
  tag: assetTag,
  typeId: id,
  brandId: id,
  model: optionalText(80, 'Model'),
  entraObjectId,
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
  brandId: id.optional(),
  model: optionalText(80, 'Model'),
  entraObjectId,
  serial: optionalText(80, 'Serial number'),
})
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>

export const assetBulkSchema = z.object({
  rows: z
    .array(
      z.object({
        tag: z.string().trim(),
        type: z.string().trim(),
        brand: z.string().trim(),
        model: z.string().trim().optional(),
        entraObjectId: z.string().trim().optional(),
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
// limits of Add asset, as do the model and Entra ObjectId; type, brand, condition and holder are looked up by name and need none.
export const assetBulkRowFields = assetCreateFields.pick({ tag: true, model: true, entraObjectId: true, serial: true })

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
  .refine((value) => !(value.employeeId && value.programId), {
    path: ['programId'],
    message: 'Choose an employee or a program, not both',
  })
  .refine((value) => value.employeeId || value.programId, {
    path: ['employeeId'],
    message: 'Choose an employee or a program',
  })
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

// ---- Lists ------------------------------------------------------------------------
/** Asset types and brands follow the kernel's rules for a list of names. */
export const assetTypeCreateSchema = namedListCreateSchema
export const assetTypeUpdateSchema = namedListUpdateSchema
export const assetBrandCreateSchema = namedListCreateSchema
export const assetBrandUpdateSchema = namedListUpdateSchema

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
