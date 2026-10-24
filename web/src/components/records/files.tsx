import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  ATTACHMENTS_PER_REQUEST,
  entryCode,
  fileExtension,
  type Section,
} from '@shared/constants.ts'
import { RECORD_NOTE_MAX } from '@shared/schemas.ts'
import type { RecordAttachment } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles, IconButton } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Textarea } from '@/components/ui/form.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { ApiError, api } from '@/lib/api.ts'
import { formatDateTime, plural } from '@/lib/format.ts'
import { useWrite } from '@/lib/hooks.ts'
import { useCan } from '@/lib/session.ts'

const ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(',')
const MB = 1024 * 1024

/**
 * A kind of record that takes files, as its module describes it: its permission resource, which is also its API path
 * (`/<section>/<code>`), what one record and its list of entries are called, and how its action items are numbered, if it has any.
 */
export interface RecordFiles {
  section: Section
  noun: string
  log: string
  itemCode?: (seq: number) => string
}
const recordPath = (record: RecordFiles, code: string) => `/${record.section}/${encodeURIComponent(code)}`

export const FILE_RULES = `PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, up to ${ATTACHMENT_MAX_BYTES / MB} MB each and ${ATTACHMENTS_PER_REQUEST} at a time.`
export const FILES_HINT = `${FILE_RULES} Once saved, a file cannot be changed or removed.`

export const fileSize = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`

/** Why these files cannot be sent, or null. The server checks them again, content and all. */
export function filesProblem(files: File[]): string | null {
  if (files.length > ATTACHMENTS_PER_REQUEST) return `Attach at most ${ATTACHMENTS_PER_REQUEST} files at a time.`
  for (const file of files) {
    if (!Object.hasOwn(ATTACHMENT_TYPES, fileExtension(file.name)))
      return `${file.name} is not a type that can be attached: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML.`
    if (file.size > ATTACHMENT_MAX_BYTES) return `${file.name} is larger than ${ATTACHMENT_MAX_BYTES / MB} MB.`
    if (file.size === 0) return `${file.name} is empty.`
  }
  return null
}

/** A write's body: the JSON as it is, or, with files, a form carrying the JSON as `data` and each file as `files`. */
export function withFiles(input: unknown, files: File[]) {
  if (!files.length) return input
  const form = new FormData()
  form.set('data', JSON.stringify(input))
  for (const file of files) form.append('files', file)
  return form
}

interface FilePickerProps {
  value: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** Chooses files to send with a form. Choosing more adds to the list; each can be taken off again before saving. */
export function FilePicker({ value, onChange, disabled, ...rest }: FilePickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-line-strong bg-canvas px-4 py-3 text-sm text-ink-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:border-ink-4">
        <input
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            onChange([...value, ...(event.target.files ?? [])])
            // So the same file can be chosen again after it is taken off.
            event.target.value = ''
          }}
          {...rest}
        />
        <Paperclip className="size-4 text-ink-3" aria-hidden />
        Choose files
      </label>
      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-ink-3">{fileSize(file.size)}</span>
              <IconButton
                size="sm"
                label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A file as the lists show it. A record's files may each belong to one of its action items. */
type Attachment = RecordAttachment & { cap?: number | null }

/** Adds files to a record, or to one of its action items, on their own: the server records them as an entry of their own. */
export function AttachFiles({ record, code, cap }: { record: RecordFiles; code: string; cap?: number }) {
  const toast = useToast()
  const attach = useWrite(
    (files: File[]) =>
      api.post<Attachment[]>(
        `${recordPath(record, code)}/attachments`,
        withFiles(cap === undefined ? {} : { capSeq: cap }, files),
      ),
    {
      success: (saved) => `${plural(saved.length, 'file')} attached`,
    },
  )
  return (
    <label
      className={buttonStyles(
        'secondary',
        'md',
        'cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent',
      )}
    >
      <input
        type="file"
        multiple
        accept={ACCEPT}
        disabled={attach.isPending}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (!files.length) return
          const problem = filesProblem(files)
          if (problem) toast({ tone: 'bad', title: 'Those files were not attached', description: problem })
          else attach.mutate(files)
        }}
      />
      {attach.isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Paperclip className="size-4" aria-hidden />
      )}
      Attach files
    </label>
  )
}

/** One file in a list: a link that downloads it, or, once withdrawn, its struck-through name and the reason. The action shows until then. */
export function FileRow({
  file,
  href,
  details,
  action,
}: {
  file: {
    filename: string
    size: number
    uploadedBy: string
    uploadedAt: string
    withdrawnAt: string | null
    withdrawnReason: string | null
  }
  href: string
  details?: ReactNode
  action?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3">
      <FileText className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {file.withdrawnAt ? (
            <span className="text-ink-3 line-through [overflow-wrap:anywhere]">{file.filename}</span>
          ) : (
            <a href={href} download className="text-accent hover:underline [overflow-wrap:anywhere]">
              {file.filename}
            </a>
          )}
          {file.withdrawnAt && <Badge tone="warn">Withdrawn</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          {fileSize(file.size)} · {file.uploadedBy} · {formatDateTime(file.uploadedAt)}
          {details}
        </div>
        {file.withdrawnAt && (
          <p className="mt-1 text-xs text-ink-2 [overflow-wrap:anywhere]">
            Withdrawn {formatDateTime(file.withdrawnAt)}: {file.withdrawnReason}
          </p>
        )}
      </div>
      {!file.withdrawnAt && action}
    </li>
  )
}

/**
 * A record's files, or one entry's. Each downloads as a file to save; the page never shows one. A withdrawn file stays on the
 * list, with the reason, but no longer downloads.
 */
export function AttachmentList({
  record,
  code,
  files,
  sealed,
}: {
  record: RecordFiles
  code: string
  files: Attachment[]
  sealed: boolean
}) {
  const canWithdraw = useCan(record.section, 'full')
  const [withdrawing, setWithdrawing] = useState<Attachment | null>(null)
  return (
    <>
      <ul className="divide-y divide-line">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            href={`/api${recordPath(record, code)}/attachments/${file.id}`}
            details={
              <>
                {file.entrySeq !== null && <> · with {entryCode(file.entrySeq)}</>}
                {file.cap != null && record.itemCode && <> · {record.itemCode(file.cap)}</>}
              </>
            }
            action={
              !sealed &&
              canWithdraw && (
                <Button size="sm" variant="danger-ghost" onClick={() => setWithdrawing(file)}>
                  Withdraw
                </Button>
              )
            }
          />
        ))}
      </ul>
      {withdrawing && (
        <WithdrawSheet record={record} code={code} file={withdrawing} onClose={() => setWithdrawing(null)} />
      )}
    </>
  )
}

function WithdrawSheet({
  record,
  code,
  file,
  onClose,
}: {
  record: RecordFiles
  code: string
  file: Attachment
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState<string>()
  const [error, setError] = useState<ApiError | null>(null)
  const withdraw = useWrite(
    (body: { reason: string }) =>
      api.post<Attachment>(`${recordPath(record, code)}/attachments/${file.id}/withdraw`, body),
    {
      silent: true,
      success: (withdrawn) => `${withdrawn.filename} withdrawn`,
    },
  )

  async function commit() {
    setMissing(reason.trim() ? undefined : 'Say why it is being withdrawn')
    if (!reason.trim()) return
    setError(null)
    try {
      await withdraw.mutateAsync({ reason })
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Withdraw this file"
      description={`${code.toUpperCase()} · ${file.filename}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit" form="withdraw-file-form" loading={withdraw.isPending}>
            Withdraw file
          </Button>
        </>
      }
    >
      <form
        id="withdraw-file-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void commit()
        }}
      >
        {error && !Object.keys(error.fields).length && (
          <Alert tone="bad" title="That did not go through">
            {error.message}
          </Alert>
        )}
        <Alert tone="warn" title="This cannot be undone">
          A withdrawn file can no longer be downloaded. Its name, who added it and this reason stay on the {record.noun}
          . Use it for a file added by mistake.
        </Alert>
        <Field label="Reason" hint={`Shown on the ${record.log}.`} error={missing ?? error?.fields.reason}>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={RECORD_NOTE_MAX}
            rows={4}
          />
        </Field>
      </form>
    </Sheet>
  )
}
