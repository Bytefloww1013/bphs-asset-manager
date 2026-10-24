import type { DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import type { ReviewAuditAction } from '../shared/constants.ts'
import { reviewAuditLog } from './schema.ts'

export interface ReviewAuditInput {
  action: ReviewAuditAction
  entityType: 'review' | 'cap' | 'entry' | 'attachment'
  entityId: number | null
  /** The review it is about, so the entry can be hidden from that review's employee reviewed. Null for an export of Action items. */
  reviewId: number | null
  /** IDs and titles only. Never the text of findings, the review body, CAP details or updates. */
  details?: string
  at?: Date
}

/**
 * Append one entry to the Review Audit Log. Call inside the same transaction as the change it describes.
 * Review code writes here and never to the other logs; nothing else writes here.
 */
export function writeReviewAudit(db: DbLike, actor: Actor, entry: ReviewAuditInput) {
  db.insert(reviewAuditLog)
    .values({
      occurredAt: entry.at ?? new Date(),
      userId: actor.id,
      actor: actor.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reviewId: entry.reviewId,
      details: entry.details ?? '',
    })
    .run()
}
