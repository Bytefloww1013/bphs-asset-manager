import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { TrendingDown } from 'lucide-react'
import { useState } from 'react'
import type { AssignmentRow, EmployeeRef, ReturnBulkResult } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Segmented, Textarea } from '@/components/ui/form.tsx'
import { EnterKey, Kbd, Mono } from '@/components/ui/layout.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ratingTone } from '@/features/common/status.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { formatDate, formatDateTime, formatRelative, plural } from '@/lib/format.ts'
import { assignmentsQuery, lookupsQuery, refreshData } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

/** Return an asset. Opened by `?return=<assignmentId>`. */
export function ReturnSheet() {
  const search = useSearch({ from: '/_app' })
  const navigate = useNavigate()
  const close = () => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, return: undefined }) })
  if (search.return === undefined) return null
  return <ReturnForm key={search.return} assignmentId={search.return} onClose={close} />
}

type Values = { ratingId: number | null; assessor: EmployeeRef | null; notes: string }

function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-control border border-line bg-canvas px-4 py-3.5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-ink-3">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReturnForm({ assignmentId, onClose }: { assignmentId: number; onClose: () => void }) {
  const user = useUser()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: assignments = [], isFetching } = useQuery(assignmentsQuery)
  const { data: lookups } = useQuery(lookupsQuery)
  const people = lookups?.employees ?? []
  const ratings = lookups?.conditionRatings ?? []
  const assignment = assignments.find((row) => row.id === assignmentId) ?? null
  const [conflict, setConflict] = useState<ApiError | null>(null)
  const [serverError, setServerError] = useState<ApiError | null>(null)

  const issueRating = ratings.find((rating) => rating.name === assignment?.issueRating) ?? null
  const give = useWrite((value: { conditionRatingId: number; assessedById: number | null; notes: string }) => api.post(`/assignments/${assignmentId}/return`, value), { silent: true })

  const form = useForm({
    defaultValues: {
      ratingId: issueRating?.id ?? null,
      assessor: people.find((person) => person.id === user.employeeId) ?? null,
      notes: '',
    } as Values,
    validators: {
      onSubmit: ({ value }) => (value.ratingId ? undefined : { fields: { ratingId: 'Rate its condition on return.' } }),
    },
    onSubmit: async ({ value }) => {
      setConflict(null)
      setServerError(null)
      try {
        await give.mutateAsync({ conditionRatingId: value.ratingId!, assessedById: value.assessor?.id ?? null, notes: value.notes })
        toast({ title: `${assignment?.assetTag ?? 'Asset'} returned`, description: assignment ? `From ${assignment.employee.name}` : undefined })
        onClose()
      } catch (error) {
        if (error instanceof ApiError && error.code === 'already_returned') setConflict(error)
        else if (error instanceof ApiError) setServerError(error)
      }
    },
  })

  const submitted = form.state.submissionAttempts > 0
  const gone = !assignment && !isFetching && !conflict

  const footer = (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(submitting) => (
        <>
          {conflict || gone ? (
            <Button
              variant="secondary"
              onClick={async () => {
                await refreshData(queryClient)
                onClose()
              }}
            >
              Reload
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button variant="primary" type="submit" form="return-form" loading={submitting} disabled={Boolean(conflict) || gone || !assignment}>
            Return{' '}
            <Kbd className="border-white/30 bg-white/15 text-on-accent shadow-none">
              <EnterKey />
            </Kbd>
          </Button>
        </>
      )}
    </form.Subscribe>
  )

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()} title="Return an asset" description="Closes the assignment and keeps it as history." footer={footer}>
      <form
        id="return-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void form.handleSubmit()
          }
        }}
      >
        {conflict && (
          <Alert tone="bad" title="This asset was just returned by another user">
            {conflict.details?.returnedBy ?? 'Someone'} closed assignment #{assignmentId}
            {conflict.details?.returnedAt ? ` at ${formatDateTime(conflict.details.returnedAt)}, ${formatRelative(conflict.details.returnedAt)}` : ''}. Reload before recording another condition; the one-active-assignment rule is enforced in the database too.
          </Alert>
        )}
        {gone && (
          <Alert tone="warn" title="This assignment is no longer open">
            It may already have been returned. Reload to see the current list.
          </Alert>
        )}
        {serverError && (
          <Alert tone="bad" title="Could not return this asset">
            {serverError.message}
          </Alert>
        )}

        {assignment && (
          <Facts
            items={[
              { label: 'Assignment', value: <Mono>#{assignment.id}</Mono> },
              { label: 'Asset', value: <><Mono>{assignment.assetTag}</Mono> · {assignment.assetType}</> },
              { label: 'Employee', value: assignment.employee.name },
              { label: 'Issued', value: `${formatDate(assignment.issuedAt)} · ${assignment.daysOut} d` },
            ]}
          />
        )}

        <form.Field name="ratingId">
          {(field) => {
            // Read the live field value here: values read in the parent render are stale until it re-renders.
            const chosen = ratings.find((rating) => rating.id === field.state.value)
            const dropped = Boolean(chosen && issueRating && chosen.sortOrder > issueRating.sortOrder)
            return (
            <Field
              label="Return condition rating"
              error={fieldError(field, undefined, submitted)}
              hint={
                dropped && issueRating ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-warn">
                    <TrendingDown className="size-3.5" aria-hidden /> Down from {issueRating.name} at issue. The drop is kept on the record.
                  </span>
                ) : issueRating ? (
                  `Issued as ${issueRating.name}`
                ) : undefined
              }
            >
              <Segmented
                label="Return condition rating"
                value={field.state.value}
                onChange={field.handleChange}
                options={ratings.map((rating) => ({ value: rating.id, label: rating.name, tone: ratingTone(rating.name) }))}
              />
            </Field>
            )
          }}
        </form.Field>

        <form.Field name="assessor">
          {(field) => (
            <Field label="Assessed by" hint="Any employee, not only users">
              <Combobox
                items={people}
                value={field.state.value}
                onChange={field.handleChange}
                getKey={(person) => person.id}
                getLabel={(person) => `${person.name} · ${person.code}`}
                getSearch={(person) => person.department ?? ''}
                placeholder="Who checked it over?"
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <Field label="Condition notes" optional>
              <Textarea rows={3} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} placeholder="e.g. Cracked case corner, screen intact. Charger not returned." />
            </Field>
          )}
        </form.Field>
        <p className="font-mono text-xs text-ink-3">Recorded by {user.email}</p>
      </form>
    </Sheet>
  )
}

/** Return several assignments at once with one condition record shared across them. */
export function BulkReturnSheet({ rows, onClose }: { rows: AssignmentRow[]; onClose: (returned?: number[]) => void }) {
  const user = useUser()
  const toast = useToast()
  const { data: lookups } = useQuery(lookupsQuery)
  const people = lookups?.employees ?? []
  const ratings = lookups?.conditionRatings ?? []
  const [result, setResult] = useState<ReturnBulkResult | null>(null)
  const [serverError, setServerError] = useState<ApiError | null>(null)

  const give = useWrite((value: { ids: number[]; conditionRatingId: number; assessedById: number | null; notes: string }) => api.post<ReturnBulkResult>('/assignments/return-bulk', value), { silent: true })

  const form = useForm({
    defaultValues: {
      ratingId: ratings.find((rating) => rating.name.toLowerCase() === 'good')?.id ?? ratings[0]?.id ?? null,
      assessor: people.find((person) => person.id === user.employeeId) ?? null,
      notes: '',
    } as Values,
    validators: { onSubmit: ({ value }) => (value.ratingId ? undefined : { fields: { ratingId: 'Rate their condition.' } }) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        const res = await give.mutateAsync({ ids: rows.map((row) => row.id), conditionRatingId: value.ratingId!, assessedById: value.assessor?.id ?? null, notes: value.notes })
        if (res.failed.length === 0) {
          toast({ title: `${plural(res.returned.length, 'asset')} returned` })
          onClose(res.returned)
        } else setResult(res)
      } catch (error) {
        if (error instanceof ApiError) setServerError(error)
      }
    },
  })

  const submitted = form.state.submissionAttempts > 0
  return (
    <Sheet
      open
      onOpenChange={(next) => !next && onClose(result?.returned)}
      title={`Return ${plural(rows.length, 'asset')}`}
      description="One condition rating and note is recorded for each asset. Return individually if they differ."
      footer={
        result ? (
          <Button variant="primary" onClick={() => onClose(result.returned)}>
            Done
          </Button>
        ) : (
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <>
                <Button variant="secondary" onClick={() => onClose()}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" form="bulk-return-form" loading={submitting}>
                  Return {plural(rows.length, 'asset')}
                </Button>
              </>
            )}
          </form.Subscribe>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <Alert tone="ok" title={`${plural(result.returned.length, 'asset')} returned`} />
          <Alert tone="bad" title={`${plural(result.failed.length, 'asset')} could not be returned`}>
            <ul className="mt-1 list-disc pl-4">
              {result.failed.map((failure) => (
                <li key={failure.id}>
                  #{failure.id}: {failure.message}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : (
        <form
          id="bulk-return-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          {serverError && (
            <Alert tone="bad" title={`Could not return ${rows.length === 1 ? 'this asset' : 'these assets'}`}>
              {serverError.message}
            </Alert>
          )}
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-control border border-line bg-canvas text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                <Mono className="font-medium">{row.assetTag}</Mono>
                <span className="truncate text-ink-3">{row.employee.name}</span>
              </li>
            ))}
          </ul>
          <form.Field name="ratingId">
            {(field) => (
              <Field label="Return condition rating" error={fieldError(field, undefined, submitted)}>
                <Segmented
                  label="Return condition rating"
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={ratings.map((rating) => ({ value: rating.id, label: rating.name, tone: ratingTone(rating.name) }))}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="assessor">
            {(field) => (
              <Field label="Assessed by" hint="Any employee, not only users">
                <Combobox
                  items={people}
                  value={field.state.value}
                  onChange={field.handleChange}
                  getKey={(person) => person.id}
                  getLabel={(person) => `${person.name} · ${person.code}`}
                  placeholder="Who checked them over?"
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="notes">
            {(field) => (
              <Field label="Condition notes" optional>
                <Textarea rows={3} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
              </Field>
            )}
          </form.Field>
        </form>
      )}
    </Sheet>
  )
}
