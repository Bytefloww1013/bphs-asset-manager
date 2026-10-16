import type { GrievanceAttachment } from '../../shared/types.ts'
import type { DbLike } from '../db/client.ts'
import { grievanceAttachments } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { put } from '../lib/grievance-files.ts'
import type { Upload } from '../lib/uploads.ts'

/** A file as the pages see it: everything about it but its bytes. `entrySeq` is the number of the entry it came with, if any. */
export const attachmentShape = (row: typeof grievanceAttachments.$inferSelect, entrySeq: number | null): GrievanceAttachment => ({
  id: row.id,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
  sha256: row.sha256,
  entrySeq,
  uploadedBy: row.uploadedByLabel,
  uploadedAt: row.uploadedAt.toISOString(),
  withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  withdrawnReason: row.withdrawnReason,
})

/**
 * Write checked files onto a grievance, each with its own Grievance Audit Log entry. Call inside the transaction of
 * whatever they came with: the grievance (no entry) or one entry of it.
 */
export function saveAttachments(
  tx: DbLike,
  actor: Actor,
  grievance: { id: number; code: string },
  entry: { id: number; seq: number } | null,
  uploads: Upload[],
  at: Date,
): GrievanceAttachment[] {
  return uploads.map(({ bytes, ...upload }) => {
    const row = tx
      .insert(grievanceAttachments)
      .values({ grievanceId: grievance.id, entryId: entry?.id, ...upload, size: bytes.length, uploadedByUserId: actor.id, uploadedByLabel: actor.name, uploadedAt: at })
      .returning()
      .get()
    put(tx, row.id, bytes)
    writeGrievanceAudit(tx, actor, { action: 'attach', entityType: 'grievance_attachment', entityId: row.id, details: `${grievance.code} · ${row.filename}`, at })
    return attachmentShape(row, entry?.seq ?? null)
  })
}
