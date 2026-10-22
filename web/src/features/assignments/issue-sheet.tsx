import { useForm, useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultRating } from '@shared/constants.ts'
import type { AssetRow, AssignmentRow, EmployeeRef, ProgramRef } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
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

/**
 * Issue an asset. Opened by `?issue=<assetId>` (or `?issue=new` to pick one), so it can be linked to.
 * `&employee=<id>` names who receives it; `&program=<id>` (or `&program=pick`) issues it to a program instead.
 */
export function IssueSheet() {
  const search = useSearch({ from: '/_app' })
  const navigate = useNavigate()
  const close = () =>
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        issue: undefined,
        employee: undefined,
        program: undefined,
      }),
    })
  if (search.issue === undefined) return null
  return (
    <IssueForm
      key={`${search.issue}-${search.employee ?? ''}-${search.program ?? ''}`}
      assetId={typeof search.issue === 'number' ? search.issue : null}
      employeeId={search.employee ?? null}
      toProgram={search.program !== undefined}
      programId={typeof search.program === 'number' ? search.program : null}
      onClose={close}
    />
  )
}

/** The holder is an employee or a program. The choice not in use keeps what was picked, so switching back loses nothing. */
type HolderKind = 'employee' | 'program'
type Values = {
  asset: AssetRow | null
  to: HolderKind
  employee: EmployeeRef | null
  program: ProgramRef | null
  ratingId: number | null
  assessor: EmployeeRef | null
  notes: string
}

const HOLDER_KINDS: { value: HolderKind; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'program', label: 'Program' },
]

function IssueForm({
  assetId,
  employeeId,
  toProgram,
  programId,
  onClose,
}: {
  assetId: number | null
  employeeId: number | null
  toProgram: boolean
  programId: number | null
  onClose: () => void
}) {
  const user = useUser()
  const { data: assets = [] } = useQuery(assetsQuery)
  const { data: lookups } = useQuery(lookupsQuery)
  const available = useMemo(() => assets.filter((asset) => asset.state === 'in_storage'), [assets])
  const people = lookups?.employees ?? []
  const programs = lookups?.programs ?? []
  const ratings = lookups?.conditionRatings ?? []
  const toast = useToast()
  const assetInput = useRef<HTMLInputElement>(null)
  const addAnother = useRef(false)
  const [serverError, setServerError] = useState<ApiError | null>(null)
  // Set once an entry has gone through and the sheet stays open for the next one.
  const [issued, setIssued] = useState<{ assessorId: number | null; to: HolderKind } | null>(null)
  // Assets issued from this sheet. The list shows them as assigned as soon as it refetches, which is our own doing and no reason to warn.
  const [ours, setOurs] = useState<number[]>([])
  // What the last "Issue & add another" did. A toast would sit over the footer buttons the next entry needs,
  // so while the sheet stays open the confirmation is shown here instead.
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const confirmationRef = useRef<HTMLDivElement>(null)
  // On a short window the form scrolls, and the confirmation sits at its top.
  useEffect(() => {
    confirmationRef.current?.scrollIntoView({ block: 'nearest' })
  }, [confirmation])

  // The link only presets the first entry. Once something is issued here, the linked asset shows up as
  // assigned because of our own write, which is not a conflict worth warning about.
  const preset = assetId && !issued ? (assets.find((asset) => asset.id === assetId) ?? null) : null
  // `ratings` holds only the active ones. An asset's last rating is where the form starts only while it is still one of them: a deactivated one has no chip, so it would count as chosen with nothing to show it.
  const offered = (ratingId: number | null | undefined) => ratings.some((rating) => rating.id === ratingId)
  const startingRating = (asset: AssetRow | null) => {
    const last = asset?.condition?.ratingId
    return last && offered(last) ? last : (defaultRating(ratings)?.id ?? null)
  }

  // The sheet starts on the holder's field only when the link's asset is already in the Asset field.
  const startsWithAsset = preset?.state === 'in_storage'
  // Only until the choice is changed: choosing Employee or Program swaps the picker, and focus stays on the choice just made.
  const choseHolderKind = useRef(false)

  /**
   * What an entry starts as. It is both the form's default and what it resets to: the form re-syncs
   * itself to its defaults whenever those change, so any other reset value would be undone on the next render.
   */
  const startingValues = (asset: AssetRow | null, assessorId: number | null, to: HolderKind): Values => ({
    asset: asset?.state === 'in_storage' ? asset : null,
    to,
    employee: people.find((p) => p.id === employeeId) ?? null,
    program: programs.find((p) => p.id === programId) ?? null,
    ratingId: startingRating(asset),
    assessor: people.find((p) => p.id === assessorId) ?? null,
    notes: '',
  })

  const issue = useWrite(
    async (value: {
      assetId: number
      employeeId: number | null
      programId: number | null
      conditionRatingId: number
      assessedById: number | null
      notes: string
    }) => {
      const row = await api.post<AssignmentRow>('/assignments', value)
      // Before useWrite refetches the lists, so the sheet never sees the asset as assigned while it is still the preset or the choice.
      setOurs((ids) => [...ids, value.assetId])
      if (addAnother.current)
        setIssued({ assessorId: value.assessedById, to: value.programId ? 'program' : 'employee' })
      return row
    },
    { silent: true },
  )

  const form = useForm({
    defaultValues: startingValues(
      preset,
      issued ? issued.assessorId : user.employeeId,
      issued ? issued.to : toProgram ? 'program' : 'employee',
    ),
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.asset) fields.asset = 'Choose the asset to issue.'
        if (value.to === 'employee' && !value.employee) fields.employee = 'Choose who is receiving it.'
        if (value.to === 'program' && !value.program) fields.program = 'Choose the program receiving it.'
        // Also catches a rating that was deactivated while the sheet was open, which the chips no longer show.
        if (!offered(value.ratingId)) fields.ratingId = 'Rate its condition.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)
      try {
        const row = await issue.mutateAsync({
          assetId: value.asset!.id,
          employeeId: value.to === 'employee' ? value.employee!.id : null,
          programId: value.to === 'program' ? value.program!.id : null,
          conditionRatingId: value.ratingId!,
          assessedById: value.assessor?.id ?? null,
          notes: value.notes,
        })
        const summary = `${row.assetTag} issued to ${(row.employee ?? row.program)?.name}`
        if (addAnother.current) {
          addAnother.current = false
          setConfirmation(summary)
          formApi.reset(startingValues(null, value.assessor?.id ?? null, value.to))
          // The next entry starts with the asset, wherever focus was when this one was submitted.
          assetInput.current?.focus()
        } else {
          toast({ title: summary })
          onClose()
        }
      } catch (error) {
        addAnother.current = false
        setConfirmation(null)
        if (error instanceof ApiError) setServerError(error)
      }
    },
  })

  const submitted = form.state.submissionAttempts > 0
  // What stands in the way is judged on the asset in the field, as the register knows it now: someone else may have issued or
  // retired it while the sheet was open. An asset the link named but that cannot be issued never gets into the field; it is
  // explained until another is chosen, and is no reason to refuse the one that is.
  const chosen = useStore(form.store, (state) => state.values.asset)
  const to = useStore(form.store, (state) => state.values.to)
  const latest = chosen ? (assets.find((asset) => asset.id === chosen.id) ?? chosen) : null
  const blocked = latest && latest.state !== 'in_storage' && !ours.includes(latest.id) ? latest : null
  const unavailable = !chosen && preset && preset.state !== 'in_storage' ? preset : null
  const warning = blocked ?? unavailable

  /** Every way of submitting comes through here: both buttons, Enter, Shift+Enter and Ctrl+Enter. */
  const submit = (another: boolean) => {
    if (blocked) return
    addAnother.current = another
    void form.handleSubmit()
  }

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={submitting || Boolean(blocked)} onClick={() => submit(true)}>
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
    <Sheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Issue a physical asset"
      description="Creates one assignment, one condition record and one audit entry."
      footer={footer}
    >
      <form
        id="issue-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          submit(false)
        }}
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' ||
            ((event.target as HTMLElement).tagName === 'TEXTAREA' && !(event.metaKey || event.ctrlKey))
          )
            return
          if (event.shiftKey) {
            event.preventDefault()
            submit(true)
          } else if (event.metaKey || event.ctrlKey) {
            event.preventDefault()
            submit(false)
          }
        }}
      >
        {confirmation && (
          <div ref={confirmationRef} className="scroll-mt-5">
            <Alert tone="ok" title={confirmation} />
          </div>
        )}
        {warning && (
          <Alert tone="warn" title={`${warning.tag} can't be issued`}>
            It is {stateLabel(warning.state).toLowerCase()}
            {warning.holder || warning.program ? ` to ${(warning.holder ?? warning.program)?.name}` : ''}.{' '}
            {warning.state === 'assigned'
              ? 'Return it first; a handoff is a return followed by an issue.'
              : 'Reinstate it before issuing.'}{' '}
            {unavailable ? 'Or choose another asset below.' : 'Choose another asset to carry on.'}
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
              label="Physical asset"
              error={fieldError(field, undefined, submitted)}
              hint={
                field.state.value ? (
                  <span>
                    {field.state.value.type} · {field.state.value.brand}
                    {field.state.value.model ? ` ${field.state.value.model}` : ''}
                    {field.state.value.entraObjectId ? ` · Entra ObjectId ${field.state.value.entraObjectId}` : ''}
                    {field.state.value.serial ? ` · serial ${field.state.value.serial}` : ''} · last condition{' '}
                    {field.state.value.condition?.rating ?? 'unrecorded'}
                    {field.state.value.lastReturnedAt
                      ? ` · returned ${formatDate(field.state.value.lastReturnedAt)}`
                      : ''}
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
                  if (asset) form.setFieldValue('ratingId', startingRating(asset))
                }}
                getKey={(asset) => asset.id}
                getLabel={(asset) => asset.tag}
                getSearch={(asset) => `${asset.type} ${asset.brand} ${asset.model ?? ''} ${asset.serial ?? ''}`}
                renderItem={(asset) => (
                  <span className="flex items-baseline justify-between gap-3">
                    <Mono className="font-medium">{asset.tag}</Mono>
                    <span className="truncate text-xs text-ink-3">
                      {asset.type} · {[asset.brand, asset.model].filter(Boolean).join(' ')}
                      {asset.serial ? ` · ${asset.serial}` : ''}
                    </span>
                  </span>
                )}
                placeholder="Start typing a tag or serial"
                emptyText="No matching physical assets in storage"
                autoFocus={!startsWithAsset}
                inputRef={assetInput}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="to">
          {(field) => (
            <Field label="Issue to">
              <Segmented
                label="Issue to"
                value={field.state.value}
                onChange={(next) => {
                  choseHolderKind.current = true
                  field.handleChange(next)
                }}
                options={HOLDER_KINDS}
              />
            </Field>
          )}
        </form.Field>

        {to === 'program' ? (
          <form.Field name="program">
            {(field) => (
              <Field
                label="Program"
                error={fieldError(field, undefined, submitted)}
                hint={
                  programs.length === 0 ? 'There are no active programs. Add one on the Programs screen.' : undefined
                }
              >
                <Combobox
                  items={programs}
                  value={field.state.value}
                  onChange={field.handleChange}
                  getKey={(program) => program.id}
                  getLabel={(program) => program.name}
                  getSearch={(program) => program.code}
                  renderItem={(program) => (
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{program.name}</span>
                      <Mono className="shrink-0 text-xs text-ink-3">{program.code}</Mono>
                    </span>
                  )}
                  placeholder="Search by name or Program ID"
                  emptyText="No matching programs"
                  autoFocus={startsWithAsset && !choseHolderKind.current}
                />
              </Field>
            )}
          </form.Field>
        ) : (
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
                  autoFocus={startsWithAsset && !choseHolderKind.current}
                />
              </Field>
            )}
          </form.Field>
        )}

        <form.Field name="ratingId">
          {(field) => (
            <Field label="Condition rating" error={fieldError(field, undefined, submitted)}>
              <Segmented
                label="Condition rating"
                value={field.state.value}
                onChange={field.handleChange}
                options={ratings.map((rating) => ({
                  value: rating.id,
                  label: rating.name,
                  tone: ratingTone(rating.score),
                }))}
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
              <Textarea
                rows={3}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. Scuff on rear casing, screen clean, charger included."
              />
            </Field>
          )}
        </form.Field>
        <p className="font-mono text-xs text-ink-3">Recorded by {user.email}</p>
      </form>
    </Sheet>
  )
}
