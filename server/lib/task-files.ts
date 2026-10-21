import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.ts'
import { taskAttachmentData } from '../db/schema.ts'

// The only code that reads or writes the bytes of a task's files, as review files are kept.

/** Store a file's bytes, inside the transaction that writes its attachment row. They go only with their task. */
export function put(tx: DbLike, attachmentId: number, bytes: Buffer) {
  tx.insert(taskAttachmentData).values({ attachmentId, bytes }).run()
}

export function get(db: DbLike, attachmentId: number): Buffer | undefined {
  return db
    .select({ bytes: taskAttachmentData.bytes })
    .from(taskAttachmentData)
    .where(eq(taskAttachmentData.attachmentId, attachmentId))
    .get()?.bytes
}
