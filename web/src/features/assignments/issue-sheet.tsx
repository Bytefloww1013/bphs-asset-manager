import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import type { AssetRow, AssignmentRow, EmployeeRef } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Segmented, Textarea } from '@/components/ui/form.tsx'
import { EnterKey, Kbd, Mono, ShiftEnterKeys } from '@/components/ui/layout.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ratingTone, stateLabel } from '@/features/common/status.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { formatDate } from '@/lib/format.ts'
import { assetsQuery, lookupsQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

/** Issue an asset. Opened by `?issue=<assetId>` (or `?issue=new` to pick one), so it can be linked to. */
export function IssueSheet() {
  const search = useSearch({ from: '/_app' })
  const navigate = useNavigate()
  const close = () => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, issue: undefined, employee: undefined }) })
  if (search.issue === undefined) return null
  return <IssueForm key={`${search.issue}-${search.employee ?? ''}`} assetId={typeof search.issue === 'number' ? search.issue : null} employeeId={search.employee ?? null} onClose={close} />
}

type Values = { asset: AssetRow | null; employee: EmployeeRef | null; ratingId: number | null; assessor: EmployeeRef | null; notes: string }

function IssueForm({ assetId, employeeId, onClose }: { assetId: number | null; employeeId: number | null; onClose: () => void }) {
  const user = useUser()
  const { data: assets = [] } = useQuery(assetsQuery)
  const { data: lookups } = useQuery(lookupsQuery)
  const available = useMemo(() => assets.filter((asset) => asset.state === 'in_storage'), [assets])
  const people = lookups?.employees ?? []
  const ratings = lookups?.conditionRatings ?? []
  const addAnother = useRef(false)
  const [serverError, setServerError] = useState<ApiError | null>(null)
  // Set once an entry has gone through and the sheet stays open for the next one.
  const [issued, setIssued] = useState<{ assessorId: number | null } | null>(null)

  // The link only presets the first entry. Once something is issued here, the linked asset shows up as
  // assigned because of our own write, which is not a conflict worth warning about.
  const preset = assetId && !issued ? (assets.find((asset) => asset.id === assetId) ?? null) : null
  const defaultRating = (asset: AssetRow | null) => asset?.condition?.ratingId ?? ratings.find((r) => r.name.toLowerCase() === 'good')?.id ?? ratings[0]?.id ?? null

  /**
   * What an entry starts as. It is both the form's default and what it resets to: the form re-syncs
   * itself to its defaults whenever those change, so any other reset value would be undone on the next render.
   */
  const startingValues = (asset: AssetRow | null, assessorId: number | null): Values => ({
    asset: asset?.state === 'in_storage' ? asset : null,
    employee: people.find((p) => p.id === employeeId) ?? null,
    ratingId: defaultRating(asset),
    assessor: people.find((p) => p.id === assessorId) ?? null,
    notes: '',
  })

  const issue = useWrite(
    async (value: { assetId: number; employeeId: number; conditionRatingId: number; assessedById: number | null; notes: string }) => {
      const row = await api.post<AssignmentRow>('/assignments', value)
      // Before useWrite refetches the lists, so the sheet never sees the asset as assigned while it is still the preset.
      if (addAnother.current) setIssued({ assessorId: value.assessedById })
      return row
    },
    {
      silent: true,
      success: (row) => `${row.assetTag} issued to ${row.employee.name}`,
    },
  )

  const form = useForm({
    defaultValues: startingValues(preset, issued ? issued.assessorId : user.employeeId),
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.asset) fields.asset = 'Choose the asset to issue.'
        if (!value.employee) fields.employee = 'Choose who is receiving it.'
        if (!value.ratingId) fields.ratingId = 'Rate its condition.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)
      try {
        await issue.mutateAsync({
          assetId: value.asset!.id,
          employeeId: value.employee!.id,
          conditionRatingId: value.ratingId!,
          assessedById: value.assessor?.id ?? null,
          notes: value.notes,
        })
        if (addAnother.current) {
          addAnother.current = false
          formApi.reset(startingValues(null, value.assessor?.id ?? null))
        } else onClose()
      } catch (error) {
        addAnother.current = false
        if (error instanceof ApiError) setServerError(error)
      }
    },
  })

  const submitted = form.state.submissionAttempts > 0
  const blocked = preset && preset.state !== 'in_storage' ? preset : null

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={submitting || Boolean(blocked)}
              onClick={() => {
                addAnother.current = true
                void form.handleSubmit()
              }}
            >
              Issue &amp; add another{' '}
              <Kbd>
                <ShiftEnterKeys />
              </Kbd>
            </Button>
            <Button variant="primary" type="submit" form="issue-form" loading={submitting} disabled={Boolean(blocked)}>
              Issue{' '}
              <Kbd className="border-white/30 bg-white/15 text-on-accent shadow-none">
                <EnterKey />
              </Kbd>
            </Button>
          </div>
        )}
      </form.Subscribe>
    </div>
  )

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()} title="Issue an asset" description="Creates one assignment, one condition record and one audit entry." footer={footer}>
      <form
        id="issue-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || (event.target as HTMLElement).tagName === 'TEXTAREA' && !(event.metaKey || event.ctrlKey)) return
          if (event.shiftKey) {
            event.preventDefault()
            addAnother.current = true
            void form.handleSubmit()
          } else if (event.metaKey || event.ctrlKey) {
            event.preventDefault()
            void form.handleSubmit()
          }
        }}
      >
        {blocked && (
          <Alert tone="warn" title={`${blocked.tag} can't be issued`}>
            It is {stateLabel(blocked.state).toLowerCase()}
            {blocked.holder ? ` to ${blocked.holder.name}` : ''}. {blocked.state === 'assigned' ? 'Return it first; a handoff is a return followed by an issue.' : 'Reinstate it before issuing.'}
          </Alert>
        )}
        {serverError && (
          <Alert tone="bad" title="Could not issue this asset">
            {serverError.message}
          </Alert>
        )}

        <form.Field name="asset">
          {(field) => (
            <Field
              label="Asset"
              error={fieldError(field, undefined, submitted)}
              hint={
                field.state.value ? (
                  <span>
                    {field.state.value.type}
                    {field.state.value.serial ? ` · serial ${field.state.value.serial}` : ''} · last condition {field.state.value.condition?.rating ?? 'unrecorded'}
                    {field.state.value.lastReturnedAt ? ` · returned ${formatDate(field.state.value.lastReturnedAt)}` : ''}
                  </span>
                ) : (
                  `${available.length} in storage and ready to issue`
                )
              }
            >
              <Combobox
                mono
                items={available}
                value={field.state.value}
                onChange={(asset) => {
                  field.handleChange(asset)
                  if (asset) form.setFieldValue('ratingId', defaultRating(asset))
                }}
                getKey={(asset) => asset.id}
                getLabel={(asset) => asset.tag}
                getSearch={(asset) => `${asset.type} ${asset.serial ?? ''}`}
                renderItem={(asset) => (
                  <span className="flex items-baseline justify-between gap-3">
                    <Mono className="font-medium">{asset.tag}</Mono>
                    <span className="truncate text-xs text-ink-3">
                      {asset.type}
                      {asset.serial ? ` · ${asset.serial}` : ''}
                    </span>
                  </span>
                )}
                placeholder="Start typing a tag or serial"
                emptyText="No matching assets in storage"
                autoFocus={!preset}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="employee">
          {(field) => (
            <Field label="Employee" error={fieldError(field, undefined, submitted)}>
              <Combobox
                items={people}
                value={field.state.value}
                onChange={field.handleChange}
                getKey={(person) => person.id}
                getLabel={(person) => person.name}
                getSearch={(person) => `${person.code} ${person.department ?? ''}`}
                renderItem={(person) => (
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{person.name}</span>
                    <span className="shrink-0 text-xs text-ink-3">
                      <Mono>{person.code}</Mono>
                      {person.department ? ` · ${person.department}` : ''}
                    </span>
                  </span>
                )}
                placeholder="Search by name, ID or department"
                emptyText="No matching employees"
                autoFocus={Boolean(preset)}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="ratingId">
          {(field) => (
            <Field label="Condition rating" error={fieldError(field, undefined, submitted)}>
              <Segmented
                label="Condition rating"
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
                getSearch={(person) => person.department ?? ''}
                placeholder="Who checked it over?"
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <Field label="Condition notes" optional>
              <Textarea rows={3} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} placeholder="e.g. Scuff on rear casing, screen clean, charger included." />
            </Field>
          )}
        </form.Field>
        <p className="font-mono text-xs text-ink-3">Recorded by {user.email}</p>
      </form>
    </Sheet>
  )
}
