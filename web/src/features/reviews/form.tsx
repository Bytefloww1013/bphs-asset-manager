import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import {
  GRIEVANCE_TITLE_MAX,
  REVIEW_FINDINGS_MAX,
  REVIEW_SUMMARY_MAX,
  localToday,
  reviewCreateSchema,
  reviewUpdateSchema,
} from '@shared/schemas.ts'
import type { EmployeeRow, ReviewDetail } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { DateInput, Field, Input, Textarea } from '@/components/ui/form.tsx'
import { Mono, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { employeesQuery, refreshData } from '@/lib/queries.ts'
import { useDenied, useUser } from '@/lib/session.ts'

const employeeKey = (person: EmployeeRow) => person.id
const employeeLabel = (person: EmployeeRow) => person.name
const employeeSearch = (person: EmployeeRow) => person.code

const count = (text: string, max: number) => `${text.trim().length} of ${max} characters`

interface Problem {
  message: string
  fields: Record<string, string>
  code?: string
}

/**
 * The form a review is recorded with, and the same form for editing one. Every edit is written to the review's history with what
 * it replaced, so nothing asks why.
 *
 * Nothing typed here is kept in browser storage: a review is sensitive and the machine may be shared.
 */
export function ReviewForm({ review, onReload }: { review?: ReviewDetail; onReload?: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const user = useUser()
  const { data: employees = [] } = useQuery(employeesQuery)
  const noCreate = useDenied('reviews', 'edit')
  // What the form started from, read once: a review that changes underneath is for the save to refuse, not for the form to follow.
  const [was] = useState(review)
  const find = (id?: number) => employees.find((row) => row.id === id) ?? null
  // Someone already named stays offered after they are archived; anyone newly named must be active.
  const offered = (keep?: number) => employees.filter((person) => person.state === 'active' || person.id === keep)

  const [title, setTitle] = useState(was?.title ?? '')
  const [summary, setSummary] = useState(was?.summary ?? '')
  const [reviewDate, setReviewDate] = useState(was?.reviewDate ?? localToday)
  const [reviewer, setReviewer] = useState<EmployeeRow | null>(() => find(was?.reviewer.id))
  const [employee, setEmployee] = useState<EmployeeRow | null>(() => find(was?.employee.id))
  const [findings, setFindings] = useState(was?.findings ?? '')
  const [body, setBody] = useState(was?.bodyHtml ?? '')
  const [problem, setProblem] = useState<Problem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saved = useRef(false)

  const save = useWrite(
    (input: unknown) =>
      was
        ? api.patch<ReviewDetail>(`/reviews/${encodeURIComponent(was.code)}`, input)
        : api.post<ReviewDetail>('/reviews', input),
    { silent: true },
  )
  const dirty = was
    ? title !== was.title ||
      summary !== was.summary ||
      reviewDate !== was.reviewDate ||
      reviewer?.id !== was.reviewer.id ||
      employee?.id !== was.employee.id ||
      findings !== was.findings ||
      body !== was.bodyHtml
    : Boolean(title.trim() || summary.trim() || findings.trim() || body || reviewer || employee)
  const leaving = useBlocker({
    shouldBlockFn: () => dirty && !saved.current,
    enableBeforeUnload: () => dirty && !saved.current,
    withResolver: true,
  })
  const stale = problem?.code === 'stale_version'

  function refuse(next: Problem) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const fields = { title, summary, reviewDate, reviewerId: reviewer?.id, employeeId: employee?.id, findings, body }
    const parsed = was
      ? reviewUpdateSchema.safeParse({ ...fields, version: was.version })
      : reviewCreateSchema.safeParse(fields)
    if (!parsed.success)
      return refuse({
        message: 'Some of this is missing or needs changing. Nothing has been saved.',
        fields: fieldMessages(parsed.error),
      })
    try {
      const row = await save.mutateAsync(parsed.data)
      saved.current = true
      toast({ title: was ? `${row.code} edited` : `${row.code} recorded`, description: row.title })
      await navigate({ to: '/reviews/$code', params: { code: row.code } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  const error = (name: string) => problem?.fields[name] ?? null
  const edit =
    <T,>(name: string, set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setProblem((now) =>
        now && name in now.fields
          ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) }
          : now,
      )
    }

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
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm">
            <dt className="font-medium text-ink">Review ID</dt>
            <dd className="text-ink-3">
              {was ? (
                <Mono className="text-ink-2">{was.code}</Mono>
              ) : (
                <>
                  <Mono>AR-{new Date().getFullYear()}-····</Mono> Assigned when saved
                </>
              )}
            </dd>
          </dl>

          {stale ? (
            <Alert
              tone="bad"
              title="Someone else edited this review first"
              action={
                <Button onClick={() => void refreshData(queryClient).then(onReload)}>
                  Discard my changes and reload
                </Button>
              }
            >
              {problem.message} What you have typed is still below, so you can copy what you need. Then reload the
              review as it now stands and make your change again.
            </Alert>
          ) : (
            problem && (
              <Alert tone="bad" title="Not saved">
                {problem.message}
              </Alert>
            )
          )}

          <Field label="Title" hint={count(title, GRIEVANCE_TITLE_MAX)} error={error('title')}>
            <Input
              value={title}
              onChange={(event) => edit('title', setTitle)(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Field>
          <Field
            label="Summary"
            hint={`One or two sentences, shown in the list. ${count(summary, REVIEW_SUMMARY_MAX)}`}
            error={error('summary')}
          >
            <Textarea
              rows={2}
              className="min-h-0"
              value={summary}
              onChange={(event) => edit('summary', setSummary)(event.target.value)}
            />
          </Field>
          <Field label="Review date" hint="The day the review was held. Today or earlier." error={error('reviewDate')}>
            <DateInput
              className="sm:max-w-56"
              max={localToday()}
              value={reviewDate}
              onChange={(event) => edit('reviewDate', setReviewDate)(event.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Reviewed by"
              hint="Who conducted the review. They can edit it and add updates later, even with Read Only access."
              error={error('reviewerId')}
            >
              <Combobox
                items={offered(was?.reviewer.id).filter((person) => person.id !== employee?.id)}
                value={reviewer}
                onChange={edit('reviewerId', setReviewer)}
                getKey={employeeKey}
                getLabel={employeeLabel}
                getSearch={employeeSearch}
                placeholder="Search by name or Employee ID"
                emptyText="No active employee matches"
              />
            </Field>
            <Field
              label="Employee reviewed"
              hint="The review is hidden from this employee's own account."
              error={error('employeeId')}
            >
              <Combobox
                // You cannot review yourself here: the review would disappear from you the moment it was saved.
                items={offered(was?.employee.id).filter(
                  (person) => person.id !== reviewer?.id && person.id !== user.employeeId,
                )}
                value={employee}
                onChange={edit('employeeId', setEmployee)}
                getKey={employeeKey}
                getLabel={employeeLabel}
                getSearch={employeeSearch}
                placeholder="Search by name or Employee ID"
                emptyText="No active employee matches"
              />
            </Field>
          </div>
          <Field
            label="Findings"
            optional
            hint={`What the review found, in plain text. ${count(findings, REVIEW_FINDINGS_MAX)}`}
            error={error('findings')}
          >
            <Textarea
              rows={5}
              value={findings}
              onChange={(event) => edit('findings', setFindings)(event.target.value)}
            />
          </Field>
          <Field
            label="Review body"
            optional
            hint="The review in full. It can also be written later, with Edit."
            error={error('body')}
          >
            <RichTextEditor label="Review body" defaultValue={was?.bodyHtml} onChange={edit('body', setBody)} />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            {was ? (
              <Link to="/reviews/$code" params={{ code: was.code }} className={buttonStyles('secondary')}>
                Cancel
              </Link>
            ) : (
              <Link to="/reviews" className={buttonStyles('secondary')}>
                Cancel
              </Link>
            )}
            <Button
              variant="primary"
              type="submit"
              loading={save.isPending}
              disabledReason={
                (review ? undefined : noCreate) ??
                (stale
                  ? 'This review was edited by someone else. Reload it first.'
                  : was && !dirty
                    ? 'Nothing has been changed yet.'
                    : undefined)
              }
            >
              {was ? 'Save changes' : 'Save review'}
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
            : 'This review has not been saved. If you leave now, what you have written is lost.'
        }
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => leaving.proceed?.()}
      />
    </>
  )
}
