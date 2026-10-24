import { z } from 'zod'
import { optionalText, requiredText } from '#shared/schemas.ts'

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
