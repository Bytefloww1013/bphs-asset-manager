import { createHash } from 'node:crypto'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, ATTACHMENTS_PER_REQUEST, fileExtension, type AttachmentExtension } from '../../shared/constants.ts'
import type { GrievanceAttachment } from '../../shared/types.ts'
import type { DbLike } from '../db/client.ts'
import { grievanceAttachments } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { invalid } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { put } from '../lib/grievance-files.ts'

/** A file from a request that has passed every check, ready to be written. */
export interface Upload {
  filename: string
  contentType: string
  bytes: Buffer
  sha256: string
}

const FILENAME_MAX = 200

const PDF = Buffer.from('%PDF-')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const starts = (bytes: Buffer, head: Buffer) => bytes.subarray(0, head.length).equals(head)
// shortcut: an Office file is a zip that names [Content_Types].xml and its own folder somewhere, without reading the zip's directory; parse it if a lookalike ever matters.
const office = (folder: string) => (bytes: Buffer) => starts(bytes, ZIP) && bytes.includes('[Content_Types].xml') && bytes.includes(folder)
const text = (bytes: Buffer) => !bytes.includes(0)

/** Whether a file's content is what its extension says. */
const LOOKS_LIKE: Record<AttachmentExtension, (bytes: Buffer) => boolean> = {
  pdf: (bytes) => starts(bytes, PDF),
  png: (bytes) => starts(bytes, PNG),
  jpg: (bytes) => starts(bytes, JPEG),
  jpeg: (bytes) => starts(bytes, JPEG),
  docx: office('word/'),
  xlsx: office('xl/'),
  txt: text,
  // A message opens with a header line, Name: value.
  eml: (bytes) => text(bytes) && /^[!-9;-~]+:/.test(bytes.subarray(0, 1000).toString('latin1')),
}

/** The name without any folder or control characters, cut to a length any page can show, keeping its extension. */
function cleanName(raw: string) {
  const name = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (name.length <= FILENAME_MAX) return name
  const extension = fileExtension(name)
  return `${name.slice(0, FILENAME_MAX - extension.length - 1)}.${extension}`
}

/**
 * Read and check a request's files before anything is written. The type stored is the one the extension names and the
 * content bears out, never the one the browser sent.
 */
export async function readUploads(files: File[]): Promise<Upload[]> {
  if (files.length > ATTACHMENTS_PER_REQUEST) throw invalid(`Attach at most ${ATTACHMENTS_PER_REQUEST} files at a time.`, { field: 'files' })
  const uploads: Upload[] = []
  for (const file of files) {
    const filename = cleanName(file.name)
    const refuse = (why: string) => invalid(`${filename || 'A file'} ${why}`, { field: 'files' })
    if (file.size > ATTACHMENT_MAX_BYTES) throw refuse(`is larger than ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`)
    if (file.size === 0) throw refuse('is empty.')
    const extension = fileExtension(filename)
    if (!Object.hasOwn(ATTACHMENT_TYPES, extension)) throw refuse('is not a file a grievance takes: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML.')
    const bytes = Buffer.from(await file.arrayBuffer())
    if (!LOOKS_LIKE[extension as AttachmentExtension](bytes)) throw refuse(`is not the ${extension.toUpperCase()} file its name says it is.`)
    uploads.push({ filename, contentType: ATTACHMENT_TYPES[extension as AttachmentExtension], bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return uploads
}

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
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      entrySeq: entry?.seq ?? null,
      uploadedBy: row.uploadedByLabel,
      uploadedAt: row.uploadedAt.toISOString(),
    }
  })
}
