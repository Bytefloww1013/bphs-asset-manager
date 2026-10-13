import type { GrievanceAuditAction } from '../../shared/constants.ts'
import type { DbLike } from '../db/client.ts'
import { grievanceAuditLog } from '../db/schema.ts'
import type { Actor } from './audit.ts'

export interface GrievanceAuditInput {
  action: GrievanceAuditAction
  entityType: string
  entityId: number | null
  /** The ID and title only. Never body text. */
  details?: string
  at?: Date
}

/**
 * Append one entry to the Grievance Audit Log. Call inside the same transaction as the change it describes.
 * Grievance code writes here and never to the Audit Log; nothing else writes here.
 */
export function writeGrievanceAudit(db: DbLike, actor: Actor, entry: GrievanceAuditInput) {
  db.insert(grievanceAuditLog)
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
