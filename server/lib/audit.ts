import type { AuditAction } from '../../shared/constants.ts'
import type { Grantee } from '../../shared/permissions.ts'
import type { DbLike } from '../db/client.ts'
import { auditLog } from '../db/schema.ts'

/** Who is doing something. Their email is what the audit log records: it is unique, and the part before the @ is not. */
export interface Actor extends Grantee {
  id: number
  email: string
  name: string
  employeeId: number | null
}

export interface AuditInput {
  action: AuditAction
  entityType: string
  entityId: number | null
  details?: string
  at?: Date
}

/** Append one entry. Call inside the same transaction as the change it describes. */
export function writeAudit(db: DbLike, actor: Actor, entry: AuditInput) {
  db.insert(auditLog)
    .values({
      occurredAt: entry.at ?? new Date(),
      userId: actor.id,
      actor: actor.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details ?? '',
    })
    .run()
}
