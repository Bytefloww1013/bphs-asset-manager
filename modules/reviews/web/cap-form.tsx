import type { EmployeeRow } from '#foundation/employees/shared/index.ts'
import { employeesQuery } from '#foundation/employees/web/index.ts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { EntryFields, type EntryText } from '@/components/records/entry-fields.tsx'
import { filesProblem, withFiles } from '@/components/records/files.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { DateInput, Field } from '@/components/ui/form.tsx'
import { Mono, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { useWrite } from '@/lib/hooks.ts'
import { refreshData } from '@/lib/session.ts'
import { reviewCapCode } from '../shared/constants.ts'
import { reviewCapCreateSchema, reviewCapUpdateSchema } from '../shared/schemas.ts'
import type { ReviewCap, ReviewDetail } from '../shared/types.ts'
import { ReviewStatusBadge } from './status.tsx'

interface Problem {
  message: string
  fields: Record<string, string>
  code?: string
}

/**
 * Add a CAP to a review, or edit one. It is the grievance's Add entry form with a responsible employee and a due date, and no
 * Occurred at: a CAP's time is recorded when it is saved. An edit goes on the review's history with what it replaced. Its pages are
 * not found by an account that may not change the review (issue #27), so the form does not check access itself.
 */
export function CapForm({ review, cap, onReload }: { review: ReviewDetail; cap?: ReviewCap; onReload?: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: employees = [] } = useQuery(employeesQuery)
  // What the form started from, read once, as on the review form: a CAP that changes underneath is for the save to refuse.
  const [was] = useState(cap)
  const [entry, setEntry] = useState<EntryText>({
    title: was?.title ?? '',
    shortDescription: was?.shortDescription ?? '',
    body: was?.bodyHtml ?? '',
    files: [],
  })
  const [responsible, setResponsible] = useState<EmployeeRow | null>(
    () => employees.find((row) => row.id === was?.responsible.id) ?? null,
  )
  const [dueDate, setDueDate] = useState(was?.dueDate ?? '')
  const [problem, setProblem] = useState<Problem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saved = useRef(false)

  const path = `/reviews/${encodeURIComponent(review.code)}/caps`
  const save = useWrite(
    (input: unknown) => (was ? api.patch<ReviewCap>(`${path}/${was.seq}`, input) : api.post<ReviewCap>(path, input)),
    { silent: true },
  )
  const dirty = was
    ? entry.title !== was.title ||
      entry.shortDescription !== was.shortDescription ||
      entry.body !== was.bodyHtml ||
      responsible?.id !== was.responsible.id ||
      dueDate !== (was.dueDate ?? '')
    : Boolean(
        entry.title.trim() ||
        entry.shortDescription.trim() ||
        entry.body ||
        entry.files.length ||
        responsible ||
        dueDate,
      )
  const leaving = useBlocker({
    shouldBlockFn: () => dirty && !saved.current,
    enableBeforeUnload: () => dirty && !saved.current,
    withResolver: true,
  })
  const stale = problem?.code === 'stale_version'
  // Someone already responsible stays offered after they are archived; anyone newly named must be active.
  const offered = employees.filter((person) => person.state === 'active' || person.id === was?.responsible.id)

  function refuse(next: Problem) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const { files, ...text } = entry
    // An empty date input is no due date, which the server takes as null.
    const fields = { ...text, responsibleId: responsible?.id, dueDate: dueDate || null }
    const parsed = was
      ? reviewCapUpdateSchema.safeParse({ ...fields, version: was.version })
      : reviewCapCreateSchema.safeParse(fields)
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
      toast({
        title: `${reviewCapCode(row.seq)} ${was ? 'edited' : `added to ${review.code}`}`,
        description: row.title,
      })
      await navigate({ to: '/reviews/$code/caps/$cap', params: { code: review.code, cap: reviewCapCode(row.seq) } })
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
  const change = <K extends keyof EntryText>(name: K, value: EntryText[K]) => {
    setEntry((now) => ({ ...now, [name]: value }))
    clear(name)
  }
  const back = was
    ? { to: '/reviews/$code/caps/$cap' as const, params: { code: review.code, cap: reviewCapCode(was.seq) } }
    : { to: '/reviews/$code' as const, params: { code: review.code } }

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!stale) void commit()
          }}
        >
          {/* Fixed by the page this was opened from: a CAP cannot be filed against another review from here. */}
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
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <dt className="font-medium text-ink">CAP</dt>
              <dd className="text-ink-3">
                {was ? <Mono className="text-ink-2">{reviewCapCode(was.seq)}</Mono> : 'Numbered when saved'}
              </dd>
            </div>
          </dl>

          {stale ? (
            <Alert
              tone="bad"
              title="Someone else changed this CAP first"
              action={
                <Button onClick={() => void refreshData(queryClient).then(onReload)}>
                  Discard my changes and reload
                </Button>
              }
            >
              {problem.message} What you have typed is still below, so you can copy what you need. Then reload the CAP
              as it now stands and make your change again.
            </Alert>
          ) : (
            problem && (
              <Alert tone="bad" title="Not saved">
                {problem.message}
              </Alert>
            )
          )}

          <EntryFields
            value={entry}
            onChange={change}
            error={error}
            files={!was}
            shortDescriptionHint="What is to be done, in one or two sentences, shown on the history and in Action items."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Responsible"
              hint="The one employee who sees it through. Having an account is not needed."
              error={error('responsibleId')}
            >
              <Combobox
                items={offered}
                value={responsible}
                onChange={(next) => (setResponsible(next), clear('responsibleId'))}
                getKey={(person) => person.id}
                getLabel={(person) => person.name}
                getSearch={(person) => person.code}
                placeholder="Search by name or Employee ID"
                emptyText="No active employee matches"
              />
            </Field>
            <Field label="Due date" optional hint="Nothing is marked overdue when it passes." error={error('dueDate')}>
              <DateInput
                className="sm:max-w-56"
                value={dueDate}
                onChange={(event) => (setDueDate(event.target.value), clear('dueDate'))}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Link {...back} className={buttonStyles('secondary')}>
              Cancel
            </Link>
            <Button
              variant="primary"
              type="submit"
              loading={save.isPending}
              disabledReason={
                stale
                  ? 'This CAP was changed by someone else. Reload it first.'
                  : was && !dirty
                    ? 'Nothing has been changed yet.'
                    : undefined
              }
            >
              {was ? 'Save changes' : 'Save CAP'}
            </Button>
          </div>
        </form>
      </Panel>

      <ConfirmDialog
        open={leaving.status === 'blocked'}
        onOpenChange={(open) => !open && leaving.reset?.()}
        title="Leave without saving?"
        description={
          was
            ? 'Your changes have not been saved. If you leave now, they are lost.'
            : 'This CAP has not been saved. If you leave now, what you have written is lost.'
        }
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => leaving.proceed?.()}
      />
    </>
  )
}
