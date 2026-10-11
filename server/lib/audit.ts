import type { AuditAction } from '../../shared/constants.ts'
import type { DbLike } from '../db/client.ts'
import { auditLog } from '../db/schema.ts'

/** Who is doing something. `label` is the short name written to the audit log. */
export interface Actor {
  id: number
  label: string
  name: string
  role: 'admin' | 'super_admin'
  employeeId: number | null
}

export function actorLabel(email: string): string {
  return email.split('@')[0] ?? email
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
      actor: actor.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details ?? '',
    })
    .run()
}
