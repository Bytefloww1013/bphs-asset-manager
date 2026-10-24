import { z } from 'zod'
import { optionalText, requiredText } from '#shared/schemas.ts'

export const programCreateSchema = z.object({
  code: requiredText(40, 'Program ID'),
  name: requiredText(120, 'Program name'),
  address: optionalText(240, 'Program address'),
})
export type ProgramCreateInput = z.infer<typeof programCreateSchema>

export const programUpdateSchema = programCreateSchema.partial()
export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>
