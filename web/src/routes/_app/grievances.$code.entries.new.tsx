import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { grievanceEntryCode, grievanceStatusLabel } from '@shared/constants.ts'
import { GRIEVANCE_SHORT_DESCRIPTION_MAX, GRIEVANCE_TITLE_MAX, grievanceEntryCreateSchema } from '@shared/schemas.ts'
import type { GrievanceEntry } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Select, Textarea } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { GrievanceLoadError } from '@/features/grievances/load-error.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { GrievanceStatusBadge } from '@/features/grievances/status.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { grievanceQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/grievances/$code/entries/new')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(grievanceQuery(params.code)),
  errorComponent: GrievanceLoadError,
  component: NewEntryPage,
})

const pad = (n: number) => String(n).padStart(2, '0')
/** This minute, in the shape a date-and-time input takes: local time, no zone. */
const localNow = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
/** The instant a date-and-time input names, or nothing when it is empty or half filled in. */
const instant = (local: string) => (local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : undefined)

const count = (text: string, max: number) => `${text.trim().length} of ${max} characters`

const KIND_HINTS = { action: 'Something done about the grievance: a meeting held, a letter sent.', event: 'Something that happened: a reply received, a deadline passed.' }

// As on New grievance, nothing typed here is kept in browser storage.
function NewEntryPage() {
  const { code } = Route.useParams()
  const { data: grievance } = useQuery(grievanceQuery(code))
  useGrievancePageTitle(`Add to ${grievance?.code ?? code.toUpperCase()}`)
  const navigate = useNavigate()
  const toast = useToast()

  const [kind, setKind] = useState<'action' | 'event'>('action')
  const [occurredAt, setOccurredAt] = useState(localNow)
  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [body, setBody] = useState('')
  const [problem, setProblem] = useState<{ message: string; fields: Record<string, string> } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saved = useRef(false)

  const save = useWrite((input: unknown) => api.post<GrievanceEntry>(`/grievances/${encodeURIComponent(code)}/entries`, input), { silent: true })
  const dirty = Boolean(title.trim() || shortDescription.trim() || body)
  const leaving = useBlocker({ shouldBlockFn: () => dirty && !saved.current, enableBeforeUnload: () => dirty && !saved.current, withResolver: true })

  if (!grievance) return null
  const sealed = grievance.status === 'closed' || grievance.status === 'voided'

  function refuse(next: { message: string; fields: Record<string, string> }) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const parsed = grievanceEntryCreateSchema.safeParse({ kind, occurredAt: instant(occurredAt), title, shortDescription, body })
    if (!parsed.success) return refuse({ message: 'Some of this is missing or needs changing. Nothing has been saved.', fields: fieldMessages(parsed.error) })
    try {
      const row = await save.mutateAsync(parsed.data)
      saved.current = true
      toast({ title: `${grievanceEntryCode(row.seq)} added to ${grievance!.code}`, description: row.title })
      await navigate({ to: '/grievances/$code', params: { code: grievance!.code } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  const error = (name: string) => problem?.fields[name] ?? null
  const edit =
    <T,>(name: string, set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setProblem((now) => (now && name in now.fields ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) } : now))
    }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/grievances/$code" params={{ code: grievance.code }} className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
        </Link>
        <div className="mt-3">
          <PageHeader title="Add an action or event" description="What was done, or what happened. Once saved it cannot be changed or removed, only corrected by a later entry." />
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
          </dl>

          {sealed ? (
            <Alert tone="warn" title={`This grievance is ${grievanceStatusLabel(grievance.status)}`}>
              Nothing more can be added to its timeline.
            </Alert>
          ) : (
            <>
              {problem && (
                <Alert tone="bad" title="Not saved">
                  {problem.message}
                </Alert>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Type" hint={KIND_HINTS[kind]} error={error('kind')}>
                  <Select value={kind} onChange={(event) => edit('kind', setKind)(event.target.value as 'action' | 'event')}>
                    <option value="action">Action</option>
                    <option value="event">Event</option>
                  </Select>
                </Field>
                <Field label="Occurred at" hint="When it happened, which may be earlier than now." error={error('occurredAt')}>
                  <Input type="datetime-local" max={localNow()} value={occurredAt} onChange={(event) => edit('occurredAt', setOccurredAt)(event.target.value)} />
                </Field>
              </div>

              <Field label="Title" hint={count(title, GRIEVANCE_TITLE_MAX)} error={error('title')}>
                <Input value={title} onChange={(event) => edit('title', setTitle)(event.target.value)} autoComplete="off" autoFocus />
              </Field>
              <Field label="Short description" hint={`One or two sentences, shown on the timeline. ${count(shortDescription, GRIEVANCE_SHORT_DESCRIPTION_MAX)}`} error={error('shortDescription')}>
                <Textarea rows={2} className="min-h-0" value={shortDescription} onChange={(event) => edit('shortDescription', setShortDescription)(event.target.value)} />
              </Field>
              <Field label="Details" hint="Optional. Anything the short description does not cover." error={error('body')}>
                <RichTextEditor label="Details" onChange={edit('body', setBody)} />
              </Field>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Link to="/grievances/$code" params={{ code: grievance.code }} className={buttonStyles('secondary')}>
              {sealed ? 'Back to the grievance' : 'Cancel'}
            </Link>
            {!sealed && (
              <Button variant="primary" type="submit" loading={save.isPending}>
                Save entry
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
