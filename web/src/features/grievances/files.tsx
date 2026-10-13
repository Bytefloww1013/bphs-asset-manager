import { Loader2, Paperclip, X } from 'lucide-react'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, ATTACHMENTS_PER_REQUEST, fileExtension } from '@shared/constants.ts'
import type { GrievanceAttachment } from '@shared/types.ts'
import { buttonStyles, IconButton } from '@/components/ui/button.tsx'
import { useToast } from '@/components/ui/feedback.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api } from '@/lib/api.ts'
import { plural } from '@/lib/format.ts'

const ACCEPT = Object.keys(ATTACHMENT_TYPES).map((extension) => `.${extension}`).join(',')
const MB = 1024 * 1024

export const FILES_HINT = `PDF, PNG, JPEG, DOCX, XLSX, TXT or EML, up to ${ATTACHMENT_MAX_BYTES / MB} MB each and ${ATTACHMENTS_PER_REQUEST} at a time. Once saved, a file cannot be changed or removed.`

export const fileSize = (bytes: number) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`)

/** Why these files cannot be sent, or null. The server checks them again, content and all. */
export function filesProblem(files: File[]): string | null {
  if (files.length > ATTACHMENTS_PER_REQUEST) return `Attach at most ${ATTACHMENTS_PER_REQUEST} files at a time.`
  for (const file of files) {
    if (!Object.hasOwn(ATTACHMENT_TYPES, fileExtension(file.name))) return `${file.name} is not a file a grievance takes: PDF, PNG, JPEG, DOCX, XLSX, TXT or EML.`
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
              <IconButton size="sm" label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Adds files to a grievance on their own: the server records them on its timeline as an entry of their own. */
export function AttachFiles({ code }: { code: string }) {
  const toast = useToast()
  const attach = useWrite((files: File[]) => api.post<GrievanceAttachment[]>(`/grievances/${encodeURIComponent(code)}/attachments`, withFiles({}, files)), {
    success: (saved) => `${plural(saved.length, 'file')} attached`,
  })
  return (
    <label className={buttonStyles('secondary', 'md', 'cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent')}>
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
      {attach.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
      Attach files
    </label>
  )
}
