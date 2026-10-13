import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.ts'
import { grievanceAttachmentData } from '../db/schema.ts'

// The only code that reads or writes the bytes of a grievance's files (G10). They live in the database;
// keeping them somewhere else would change this file and nothing outside it.

/** Store a file's bytes, inside the transaction that writes its attachment row. They are never changed or removed. */
export function put(tx: DbLike, attachmentId: number, bytes: Buffer) {
  tx.insert(grievanceAttachmentData).values({ attachmentId, bytes }).run()
}

export function get(db: DbLike, attachmentId: number): Buffer | undefined {
  return db.select({ bytes: grievanceAttachmentData.bytes }).from(grievanceAttachmentData).where(eq(grievanceAttachmentData.attachmentId, attachmentId)).get()?.bytes
}
