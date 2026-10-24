import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useBlocker, useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { BLANK_ENTRY, EntryFields, type EntryText } from '@/components/records/entry-fields.tsx'
import { filesProblem, withFiles } from '@/components/records/files.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Select } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { useWrite } from '@/lib/hooks.ts'
import { canAt } from '@shared/permissions.ts'
import { grievanceEntryCode, grievanceStatusLabel } from '../../shared/constants.ts'
import { grievanceEntryCreateSchema } from '../../shared/schemas.ts'
import type { GrievanceEntry } from '../../shared/types.ts'
import { GrievanceLoadError } from '../load-error.tsx'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceEntriesQuery, grievanceQuery } from '../queries.ts'
import { GrievanceStatusBadge } from '../status.tsx'

export const Route = createFileRoute('/_app/grievances/$code/entries/new')({
  // `corrects` is set by "Add correction" on an entry: the number of the entry being corrected.
  validateSearch: (search: Record<string, unknown>): { corrects?: number } => {
    const corrects = Number(search.corrects)
    return Number.isInteger(corrects) && corrects > 0 ? { corrects } : {}
  },
  // Adding to a timeline needs Edit access to Grievances, even for the grievance's owner; to anyone else the page doesn't exist
  // (issue #27).
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'grievances', 'edit')) throw notFound()
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceEntriesQuery(params.code)),
    ]),
  errorComponent: GrievanceLoadError,
  component: NewEntryPage,
})

const pad = (n: number) => String(n).padStart(2, '0')
/** This minute, in the shape a date-and-time input takes: local time, no zone. */
const localNow = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
/** The instant a date-and-time input names, or nothing when it is empty or half filled in. */
const instant = (local: string) =>
  local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : undefined

const KIND_HINTS = {
  action: 'Something done about the grievance: a meeting held, a letter sent.',
  event: 'Something that happened: a reply received, a deadline passed.',
}

// As on New grievance, nothing typed here is kept in browser storage.
function NewEntryPage() {
  const { code } = Route.useParams()
  const { corrects } = Route.useSearch()
  const { data: grievance } = useQuery(grievanceQuery(code))
  const { data: entries } = useQuery(grievanceEntriesQuery(code))
  // A correction is this same form with its type fixed and the entry it corrects named; that entry is never touched.
  const correcting = corrects !== undefined
  const original = correcting ? entries?.find((entry) => entry.seq === corrects && entry.kind !== 'system') : undefined
  useGrievancePageTitle(
    `${correcting ? `Correct ${grievanceEntryCode(corrects)} of` : 'Add to'} ${grievance?.code ?? code.toUpperCase()}`,
  )
  const navigate = useNavigate()
  const toast = useToast()

  const [kind, setKind] = useState<'action' | 'event'>('action')
  const [occurredAt, setOccurredAt] = useState(localNow)
  const [entry, setEntry] = useState(BLANK_ENTRY)
  const [problem, setProblem] = useState<{ message: string; fields: Record<string, string> } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saved = useRef(false)

  const save = useWrite(
    (input: unknown) => api.post<GrievanceEntry>(`/grievances/${encodeURIComponent(code)}/entries`, input),
    { silent: true },
  )
  const dirty = Boolean(entry.title.trim() || entry.shortDescription.trim() || entry.body || entry.files.length)
  const leaving = useBlocker({
    shouldBlockFn: () => dirty && !saved.current,
    enableBeforeUnload: () => dirty && !saved.current,
    withResolver: true,
  })

  if (!grievance || !entries) return null
  const sealed = grievance.status === 'closed' || grievance.status === 'voided'
  const blocked = sealed || (correcting && !original)

  function refuse(next: { message: string; fields: Record<string, string> }) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const { files, ...text } = entry
    const parsed = grievanceEntryCreateSchema.safeParse(
      correcting
        ? { kind: 'correction', correctsSeq: corrects, ...text }
        : { kind, occurredAt: instant(occurredAt), ...text },
    )
    const filesWrong = filesProblem(files)
    if (!parsed.success || filesWrong)
      return refuse({
        message: 'Some of this is missing or needs changing. Nothing has been saved.',
        fields: {
          ...(parsed.success ? {} : fieldMessages(parsed.error)),
          ...(filesWrong ? { files: filesWrong } : {}),
        },
      })
    try {
      const row = await save.mutateAsync(withFiles(parsed.data, files))
      saved.current = true
      toast({ title: `${grievanceEntryCode(row.seq)} added to ${grievance!.code}`, description: row.title })
      await navigate({ to: '/grievances/$code', params: { code: grievance!.code } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  const error = (name: string) => problem?.fields[name] ?? null
  const clear = (name: string) =>
    setProblem((now) =>
      now && name in now.fields
        ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) }
        : now,
    )
  const edit =
    <T,>(name: string, set: (value: T) => void) =>
    (value: T) => {
      set(value)
      clear(name)
    }
  const change = <K extends keyof EntryText>(name: K, value: EntryText[K]) => {
    setEntry((now) => ({ ...now, [name]: value }))
    clear(name)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to="/grievances/$code"
          params={{ code: grievance.code }}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
        </Link>
        <div className="mt-3">
          {correcting ? (
            <PageHeader
              title="Add a correction"
              description={`What ${grievanceEntryCode(corrects)} should have said. It is added as a new entry; ${grievanceEntryCode(corrects)} itself stays exactly as it was written.`}
            />
          ) : (
            <PageHeader
              title="Add an action or event"
              description="What was done, or what happened. Once saved it cannot be changed or removed, only corrected by a later entry."
            />
          )}
        </div>
      </div>
      <Panel className="p-5 sm:p-6">
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void commit()
          }}
        >
          {/* Fixed by the page this was opened from: an entry cannot be filed against another grievance from here. */}
          <dl className="flex flex-col gap-1.5 rounded-control border border-line bg-sunken px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <dt className="font-medium text-ink">Grievance ID</dt>
              <dd className="flex items-center gap-2">
                <Mono>{grievance.code}</Mono>
                <GrievanceStatusBadge status={grievance.status} />
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <dt className="font-medium text-ink">Title</dt>
              <dd className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{grievance.title}</dd>
            </div>
            {correcting && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className="font-medium text-ink">Type</dt>
                <dd className="text-ink-2">Correction</dd>
              </div>
            )}
            {original && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className="font-medium text-ink">Corrects</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">
                  <Link
                    to="/grievances/$code/entries/$seq"
                    params={{ code: grievance.code, seq: grievanceEntryCode(original.seq) }}
                    className="font-medium text-accent hover:underline"
                  >
                    <Mono>{grievanceEntryCode(original.seq)}</Mono>: {original.title}
                  </Link>
                  <span className="block text-ink-2">{original.shortDescription}</span>
                </dd>
              </div>
            )}
          </dl>

          {sealed ? (
            <Alert tone="warn" title={`This grievance is ${grievanceStatusLabel(grievance.status)}`}>
              Nothing more can be added to its timeline.
            </Alert>
          ) : correcting && !original ? (
            <Alert tone="bad" title={`${grievanceEntryCode(corrects)} cannot be corrected`}>
              {entries.some((entry) => entry.seq === corrects)
                ? 'It is an automatic entry, written by the app.'
                : `${grievance.code} has no entry with that number.`}
            </Alert>
          ) : (
            <>
              {problem && (
                <Alert tone="bad" title="Not saved">
                  {problem.message}
                </Alert>
              )}

              {!correcting && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Type" hint={KIND_HINTS[kind]} error={error('kind')}>
                    <Select
                      value={kind}
                      onChange={(event) => edit('kind', setKind)(event.target.value as 'action' | 'event')}
                    >
                      <option value="action">Action</option>
                      <option value="event">Event</option>
                    </Select>
                  </Field>
                  <Field
                    label="Occurred at"
                    hint="When it happened, which may be earlier than now."
                    error={error('occurredAt')}
                  >
                    <Input
                      type="datetime-local"
                      max={localNow()}
                      value={occurredAt}
                      onChange={(event) => edit('occurredAt', setOccurredAt)(event.target.value)}
                    />
                  </Field>
                </div>
              )}

              <EntryFields
                value={entry}
                onChange={change}
                error={error}
                shortDescriptionHint={
                  correcting
                    ? 'What was wrong and what is right, in one or two sentences.'
                    : 'One or two sentences, shown on the timeline.'
                }
              />
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Link to="/grievances/$code" params={{ code: grievance.code }} className={buttonStyles('secondary')}>
              {blocked ? 'Back to the grievance' : 'Cancel'}
            </Link>
            {!blocked && (
              <Button variant="primary" type="submit" loading={save.isPending}>
                {correcting ? 'Save correction' : 'Save entry'}
              </Button>
            )}
          </div>
        </form>
      </Panel>

      <ConfirmDialog
        open={leaving.status === 'blocked'}
        onOpenChange={(open) => !open && leaving.reset?.()}
        title="Leave without saving?"
        description="This entry has not been saved. If you leave now, what you have written is lost."
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => leaving.proceed?.()}
      />
    </div>
  )
}
