import { useMutation } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { grievanceEntryCode } from '@shared/constants.ts'
import type { GrievanceAttachment, GrievanceEntry, GrievancePerson } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { fileSize } from '@/features/common/files.tsx'
import { EntryMarker } from '@/features/common/timeline.tsx'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { formatDateTime } from '@/lib/format.ts'
import { useUser } from '@/lib/session.ts'

// The pieces of a record as it prints: a grievance's case file and a review's.

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

export function Names({ people }: { people: Pick<GrievancePerson, 'code' | 'name'>[] }) {
  return people.map((person) => (
    <div key={person.code}>
      {person.name} <Mono className="text-xs text-ink-3">{person.code}</Mono>
    </div>
  ))
}

export const Heading = ({ children }: { children: ReactNode }) => <h2 className="mb-3 border-b border-ink pb-1 text-base font-semibold">{children}</h2>

/** One row of the print table. A row is what Firefox breaks pages between. */
export const Row = ({ className, children }: { className?: string; children: ReactNode }) => (
  <tr className={className}>
    <td>{children}</td>
  </tr>
)

type PrintedEntry = Omit<GrievanceEntry, 'id' | 'kind'> & { kind: string }

/**
 * One entry with every field, its details open. Its block is kept on one page where it fits; a section's heading rides with its
 * first entry. `about` follows its number, as a review entry's CAP does.
 */
export function Entry({ entry, kindLabel, about, heading }: { entry: PrintedEntry; kindLabel: string; about?: ReactNode; heading?: ReactNode }) {
  return (
    <div className="break-inside-avoid pt-5">
      {heading}
      <div className="flex items-start gap-2">
        <EntryMarker kind={entry.kind} className="!mt-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">
            <Mono>{grievanceEntryCode(entry.seq)}</Mono>
            {about} · <span className="uppercase tracking-wide">{kindLabel}</span>
          </div>
          <h3 className="font-semibold [overflow-wrap:anywhere]">{entry.title}</h3>
          <dl className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <Fact label="Occurred">{formatDateTime(entry.occurredAt)}</Fact>
            <Fact label="Recorded">{formatDateTime(entry.recordedAt)}</Fact>
            <Fact label="Documented by">{entry.documentedBy}</Fact>
            {entry.corrects !== null && <Fact label="Corrects">{grievanceEntryCode(entry.corrects)}</Fact>}
            {entry.correctedBy.length > 0 && <Fact label="Corrected by">{entry.correctedBy.map(grievanceEntryCode).join(', ')}</Fact>}
          </dl>
          {entry.shortDescription && <p className="mt-2 [overflow-wrap:anywhere]">{entry.shortDescription}</p>}
          {entry.bodyHtml && <RichTextView html={entry.bodyHtml} className="mt-2" />}
        </div>
      </div>
    </div>
  )
}

/** Every file, withdrawn ones too, with its fingerprint. `where` says what it came with, after its name. */
export function FileTable<F extends GrievanceAttachment>({ files, where }: { files: F[]; where: (file: F) => string | null }) {
  return (
    <div className="pt-6">
      <Heading>Files</Heading>
      <table className="w-full text-left text-xs">
        <thead className="text-ink-3">
          <tr className="[&>th]:pb-1 [&>th]:pr-3 [&>th]:font-normal">
            <th>Name</th>
            <th>Size</th>
            <th>Added</th>
            <th>SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id} className="break-inside-avoid border-t border-line align-top [&>td]:py-1.5 [&>td]:pr-3">
              <td className="[overflow-wrap:anywhere]">
                {file.filename}
                {where(file) && <span className="text-ink-3"> · {where(file)}</span>}
                {file.withdrawnAt && (
                  <div className="text-ink-3">
                    Withdrawn {formatDateTime(file.withdrawnAt)}: {file.withdrawnReason}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap">{fileSize(file.size)}</td>
              <td>
                {file.uploadedBy}, {formatDateTime(file.uploadedAt)}
              </td>
              <td>
                <Mono className="text-[10px] break-all">{file.sha256}</Mono>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The page is the record as it prints, outside the app shell, with only a toolbar above it that the print leaves out. Printing
 * posts `body` to `exportPath` first, so each copy is logged. `children` are the rows of the print table.
 */
export function Printout({
  code,
  exportPath,
  body,
  back,
  options,
  ready = true,
  notice,
  children,
}: {
  code: string
  exportPath: string
  body?: unknown
  back: ReactNode
  options?: ReactNode
  ready?: boolean
  notice?: ReactNode
  children: ReactNode
}) {
  const user = useUser()
  const [exportedAt, setExportedAt] = useState(() => new Date().toISOString())
  // No printed copy without a log entry: the content prints only after the button has logged it, so Ctrl+P alone prints an instruction.
  const [logged, setLogged] = useState(false)
  const logPrint = useMutation({
    mutationFn: () => api.post(exportPath, body),
    onSuccess: () => {
      // The dialog captures the page as it is drawn when it opens, so the stamp and the gate must be rendered first.
      flushSync(() => {
        setExportedAt(new Date().toISOString())
        setLogged(true)
      })
      window.print()
    },
  })
  useEffect(() => {
    const relock = () => setLogged(false)
    window.addEventListener('afterprint', relock)
    return () => window.removeEventListener('afterprint', relock)
  }, [])

  return (
    <div className="min-h-dvh bg-surface text-sm text-ink">
      <div className="border-b border-line bg-sunken print:hidden">
        <div className="mx-auto flex max-w-[50rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          {back}
          {options}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-3">Print from this button and choose “Save as PDF” in the dialog. Each print is logged.</span>
            <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} disabled={!ready} loading={logPrint.isPending} onClick={() => logPrint.mutate()}>
              Print
            </Button>
          </div>
        </div>
        {notice}
        {logPrint.isError && (
          <p role="alert" className="mx-auto max-w-[50rem] px-6 pb-3 text-bad">
            Not printed: the print could not be logged. {logPrint.error.message}
          </p>
        )}
      </div>

      {!logged && <p className="hidden print:block">Print from the Print button on the page, so the copy is logged.</p>}
      <table className={cn('mx-auto w-full max-w-[50rem] print:max-w-none', !logged && 'print:hidden')}>
        {/* A table head repeats on every printed page, in Firefox as in Chrome, where a fixed header does not. */}
        <thead>
          <tr>
            <td className="px-6 pt-6 pb-4 print:px-0 print:pt-0">
              <div className="flex justify-between border-b border-line pb-1 text-xs">
                <Mono>{code}</Mono>
                <span className="font-semibold uppercase tracking-wide">Confidential</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody className="[&>tr>td]:px-6 print:[&>tr>td]:px-0">
          {children}
          <Row>
            <p className="mt-8 border-t border-line pt-2 pb-6 text-xs text-ink-3">
              Exported by {user.name} ({user.email}) on {formatDateTime(exportedAt)}
            </p>
          </Row>
        </tbody>
      </table>
    </div>
  )
}
