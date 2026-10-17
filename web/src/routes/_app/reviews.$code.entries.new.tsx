import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { canManageReview, reviewManageReason } from '@shared/permissions.ts'
import { reviewEntryCode } from '@shared/constants.ts'
import { reviewEntryCreateSchema } from '@shared/schemas.ts'
import type { ReviewEntry } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { BLANK_ENTRY, EntryFields, type EntryText } from '@/features/common/entry-fields.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { ReviewStatusBadge } from '@/features/reviews/status.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { reviewEntriesQuery, reviewQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/reviews/$code/entries/new')({
  // `corrects` is set by "Add correction" on an entry: the number of the entry being corrected.
  validateSearch: (search: Record<string, unknown>): { corrects?: number } => {
    const corrects = Number(search.corrects)
    return Number.isInteger(corrects) && corrects > 0 ? { corrects } : {}
  },
  loader: ({ context, params }) => Promise.all([context.queryClient.ensureQueryData(reviewQuery(params.code)), context.queryClient.ensureQueryData(reviewEntriesQuery(params.code))]),
  errorComponent: ReviewLoadError,
  component: NewUpdatePage,
})

const pad = (n: number) => String(n).padStart(2, '0')
/** This minute, in the shape a date-and-time input takes: local time, no zone. */
const localNow = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
/** The instant a date-and-time input names, or nothing when it is empty or half filled in. */
const instant = (local: string) => (local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : undefined)

// As on New review, nothing typed here is kept in browser storage.
function NewUpdatePage() {
  const { code } = Route.useParams()
  const { corrects } = Route.useSearch()
  const user = useUser()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: entries } = useQuery(reviewEntriesQuery(code))
  // A correction is this same form with the entry it corrects named; that entry is never touched.
  const correcting = corrects !== undefined
  const original = correcting ? entries?.find((entry) => entry.seq === corrects && entry.kind !== 'system') : undefined
  useReviewPageTitle(`${correcting ? `Correct ${reviewEntryCode(corrects)} of` : 'Add to'} ${review?.code ?? code.toUpperCase()}`)
  const navigate = useNavigate()
  const toast = useToast()

  const [occurredAt, setOccurredAt] = useState(localNow)
  const [entry, setEntry] = useState(BLANK_ENTRY)
  const [problem, setProblem] = useState<{ message: string; fields: Record<string, string> } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saved = useRef(false)

  const save = useWrite((input: unknown) => api.post<ReviewEntry>(`/reviews/${encodeURIComponent(code)}/entries`, input), { silent: true })
  const dirty = Boolean(entry.title.trim() || entry.shortDescription.trim() || entry.body)
  const leaving = useBlocker({ shouldBlockFn: () => dirty && !saved.current, enableBeforeUnload: () => dirty && !saved.current, withResolver: true })

  if (!review || !entries) return null
  const voided = review.status === 'voided'
  const blocked = voided || (correcting && !original)

  function refuse(next: { message: string; fields: Record<string, string> }) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const { files: _none, ...text } = entry
    const parsed = reviewEntryCreateSchema.safeParse(correcting ? { kind: 'correction', correctsSeq: corrects, ...text } : { kind: 'update', occurredAt: instant(occurredAt), ...text })
    if (!parsed.success) return refuse({ message: 'Some of this is missing or needs changing. Nothing has been saved.', fields: fieldMessages(parsed.error) })
    try {
      const row = await save.mutateAsync(parsed.data)
      saved.current = true
      toast({ title: `${reviewEntryCode(row.seq)} added to ${review!.code}`, description: row.title })
      await navigate({ to: '/reviews/$code', params: { code: review!.code } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  const error = (name: string) => problem?.fields[name] ?? null
  const clear = (name: string) => setProblem((now) => (now && name in now.fields ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) } : now))
  const change = <K extends keyof EntryText>(name: K, value: EntryText[K]) => {
    setEntry((now) => ({ ...now, [name]: value }))
    clear(name)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/reviews/$code" params={{ code: review.code }} className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> {review.code}
        </Link>
        <div className="mt-3">
          {correcting ? (
            <PageHeader title="Add a correction" description={`What ${reviewEntryCode(corrects)} should have said. It is added as a new entry; ${reviewEntryCode(corrects)} itself stays exactly as it was written.`} />
          ) : (
            <PageHeader title="Add an update" description="Something that happened since the review. Once saved it cannot be changed or removed, only corrected by a later entry." />
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
          {/* Fixed by the page this was opened from: an entry cannot be filed against another review from here. */}
          <dl className="flex flex-col gap-1.5 rounded-control border border-line bg-sunken px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <dt className="font-medium text-ink">Review ID</dt>
              <dd className="flex items-center gap-2">
                <Mono>{review.code}</Mono>
                <ReviewStatusBadge status={review.status} />
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <dt className="font-medium text-ink">Title</dt>
              <dd className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{review.title}</dd>
            </div>
            {original && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className="font-medium text-ink">Corrects</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">
                  <Mono>{reviewEntryCode(original.seq)}</Mono>: {original.title}
                  <span className="block text-ink-2">{original.shortDescription}</span>
                </dd>
              </div>
            )}
          </dl>

          {voided ? (
            <Alert tone="warn" title="This review has been voided">
              Nothing more can be added to its history.
            </Alert>
          ) : correcting && !original ? (
            <Alert tone="bad" title={`${reviewEntryCode(corrects)} cannot be corrected`}>
              {entries.some((one) => one.seq === corrects) ? 'It is an automatic entry, written by the app.' : `${review.code} has no entry with that number.`}
            </Alert>
          ) : (
            <>
              {problem && (
                <Alert tone="bad" title="Not saved">
                  {problem.message}
                </Alert>
              )}

              {!correcting && (
                <Field label="Occurred at" hint="When it happened, which may be earlier than now." error={error('occurredAt')}>
                  <Input type="datetime-local" className="sm:max-w-64" max={localNow()} value={occurredAt} onChange={(event) => (setOccurredAt(event.target.value), clear('occurredAt'))} />
                </Field>
              )}

              <EntryFields
                value={entry}
                onChange={change}
                error={error}
                files={false}
                shortDescriptionHint={correcting ? 'What was wrong and what is right, in one or two sentences.' : 'One or two sentences, shown on the history.'}
              />
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Link to="/reviews/$code" params={{ code: review.code }} className={buttonStyles('secondary')}>
              {blocked ? 'Back to the review' : 'Cancel'}
            </Link>
            {!blocked && (
              <Button variant="primary" type="submit" loading={save.isPending} disabledReason={canManageReview(user, review.reviewer.id) ? undefined : reviewManageReason(review.reviewer.name)}>
                {correcting ? 'Save correction' : 'Save update'}
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
