import { z } from 'zod'
import { calendarDate, optionalText, requiredText } from '#shared/schemas.ts'
import { MAINTENANCE_DESCRIPTION_MAX, MAINTENANCE_NOTE_MAX, MAINTENANCE_STATUSES } from './constants.ts'

// A request entered by hand. Zoho's come in through the webhook, which reads them leniently on its own.
export const maintenanceCreateSchema = z.object({
  firstName: requiredText(100, 'First name'),
  lastName: optionalText(100, 'Last name'),
  // Optional, for a request phoned in, but a real address when given.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(''), z.email('Enter a valid email address')]))
    .optional(),
  program: optionalText(100, 'Program'),
  location: requiredText(200, 'Location'),
  description: requiredText(MAINTENANCE_DESCRIPTION_MAX, 'Description'),
  urgent: z.enum(['No', 'Yes']).default('No'),
  noticedDate: calendarDate('date noticed').optional(),
})
export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateSchema>

/** Who the request is dispatched to; null clears it. */
export const maintenanceDispatchSchema = z.object({
  employeeId: z.number({ error: 'Choose an employee' }).int().positive().nullable(),
})
export const maintenanceStatusSchema = z.object({ status: z.enum(MAINTENANCE_STATUSES, { error: 'Choose a status' }) })
export const maintenanceNoteSchema = z.object({ body: requiredText(MAINTENANCE_NOTE_MAX, 'Note') })
