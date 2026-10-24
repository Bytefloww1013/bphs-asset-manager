import { z } from 'zod'
import { AUDIT_ACTIONS } from './constants.ts'

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
