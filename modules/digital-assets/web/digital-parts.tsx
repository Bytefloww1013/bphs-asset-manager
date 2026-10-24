import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Ban, CornerDownLeft, History, Pencil, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge, type Tone } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { DateInput, Field, Input, Select } from '@/components/ui/form.tsx'
import { Mono, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { formatDate, formatDateTime, plural } from '@/lib/format.ts'
import { useWrite } from '@/lib/hooks.ts'
import { useCan } from '@/lib/session.ts'
import { looksLikeSecret, type DigitalAssetRow, type DigitalAssetState } from '../shared/index.ts'
import { digitalAssetDetailQuery, digitalLookupsQuery } from './queries.ts'

/** Said wherever the License/Account field is filled in. The server refuses a value that labels itself as a credential. */
export const ACCOUNT_HINT = 'Email address or license reference. Never a password or key.'
const SECRET_MESSAGE = 'Enter the email address or license reference only, never a password or key.'

const stateMeta: Record<DigitalAssetState, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'accent' },
  not_issued: { label: 'Not Issued', tone: 'ok' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const digitalStateLabel = (state: DigitalAssetState) => stateMeta[state].label
export const DigitalStateBadge = ({ state }: { state: DigitalAssetState }) => (
  <Badge tone={stateMeta[state].tone}>{stateMeta[state].label}</Badge>
)

/** What is wrong with a License/Account value, checked here so the answer is immediate. The server checks it again. */
function accountProblem(account: string): string | null {
  if (!account.trim()) return 'Enter the license or account.'
  return looksLikeSecret(account) ? SECRET_MESSAGE : null
}

const invalidFields = (message: string, fields: Record<string, string>) =>
  new ApiError(422, { error: 'validation_failed', message, details: { fields } }, '')

export function QuickAddDigitalAsset({ onAdded }: { onAdded: (id: number) => void }) {
  const toast = useToast()
  const { data: lookups } = useQuery(digitalLookupsQuery)
  const types = lookups?.digitalAssetTypes ?? []
  const people = lookups?.employees ?? []
  const accountRef = useRef<HTMLInputElement>(null)
  const [typeId, setTypeId] = useState('')
  const [account, setAccount] = useState('')
  const [employee, setEmployee] = useState<EmployeeRef | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const add = useWrite((body: Record<string, unknown>) => api.post<DigitalAssetRow>('/digital-assets', body), {
    silent: true,
  })
  const effectiveType = typeId || String(types[0]?.id ?? '')

  async function commit() {
    setError(null)
    const problem = accountProblem(account)
    if (problem) {
      setError(invalidFields(problem, { account: problem }))
      accountRef.current?.focus()
      return
    }
    try {
      const row = await add.mutateAsync({ typeId: Number(effectiveType), account, employeeId: employee?.id ?? null })
      toast({ title: `${row.code} added`, description: row.employee ? `Issued to ${row.employee.name}` : 'Not issued' })
      onAdded(row.id)
      setAccount('')
      setEmployee(null)
      accountRef.current?.focus()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Add digital asset</h2>
        <p className="text-sm text-ink-3">The Asset ID is given automatically. {ACCOUNT_HINT}</p>
      </div>
      <form
        className="mt-4 grid items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-12"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void commit()
        }}
      >
        <Field label="Type" error={error?.fields.typeId} className="lg:col-span-3">
          <Select value={effectiveType} onChange={(event) => setTypeId(event.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="License/Account" error={error?.fields.account} className="lg:col-span-4">
          <Input
            ref={accountRef}
            value={account}
            placeholder="name@bphs.example or a license reference"
            autoComplete="off"
            onChange={(event) => setAccount(event.target.value)}
          />
        </Field>
        <Field label="Employee" optional error={error?.fields.employeeId} className="lg:col-span-3">
          <Combobox
            items={people}
            value={employee}
            onChange={setEmployee}
            getKey={(person) => person.id}
            getLabel={(person) => person.name}
            getSearch={(person) => `${person.code} ${person.department ?? ''}`}
            placeholder="Leave blank to issue it later"
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-2">
          <Button type="submit" variant="primary" className="w-full" loading={add.isPending}>
            Add <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />
          </Button>
        </div>
      </form>
      {error && !Object.keys(error.fields).length && (
        <Alert tone="bad" className="mt-4">
          {error.message}
        </Alert>
      )}
    </Panel>
  )
}

/** The Asset ID, which opens the seat's record: what it is and everyone it has been issued to. */
export function DigitalAssetIdCell({ asset }: { asset: DigitalAssetRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={`${asset.code}, open its history`}
        className="rounded-[4px] font-mono text-[0.8125rem] font-medium tabular-nums text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
        onClick={() => setOpen(true)}
      >
        {asset.code}
      </button>
      {open && <DigitalAssetDetailSheet asset={asset} onClose={() => setOpen(false)} />}
    </>
  )
}

export function DigitalAssetRowActions({ asset }: { asset: DigitalAssetRow }) {
  const canEdit = useCan('assets', 'edit')
  const canDelete = useCan('assets', 'full')
  const [sheet, setSheet] = useState<'issue' | 'edit' | 'detail' | null>(null)
  const [confirm, setConfirm] = useState<'unassign' | 'deactivate' | 'delete' | null>(null)
  const unassign = useWrite(
    (assignmentId: number | null) => api.post(`/digital-assets/${asset.id}/unassign`, { assignmentId }),
    { success: `${asset.code} unassigned` },
  )
  const deactivate = useWrite(() => api.post(`/digital-assets/${asset.id}/deactivate`), {
    success: `${asset.code} marked inactive`,
  })
  const reactivate = useWrite(() => api.post(`/digital-assets/${asset.id}/reactivate`), {
    success: `${asset.code} reactivated`,
  })
  const remove = useWrite(() => api.delete(`/digital-assets/${asset.id}`), { success: `${asset.code} deleted` })

  const items: MenuItem[] = [
    { label: 'Assignment history', icon: History, onSelect: () => setSheet('detail') },
    { label: 'Edit details', icon: Pencil, onSelect: () => setSheet('edit'), hidden: !canEdit },
    asset.state === 'inactive'
      ? { label: 'Reactivate', icon: RotateCcw, onSelect: () => reactivate.mutate(undefined), hidden: !canEdit }
      : {
          label: 'Mark inactive',
          icon: Ban,
          onSelect: () => setConfirm('deactivate'),
          hidden: !canEdit,
          disabledReason: asset.employee ? `Issued to ${asset.employee.name}. Unassign it first.` : undefined,
        },
    {
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => setConfirm('delete'),
      hidden: !canDelete,
      disabledReason: asset.hasHistory ? 'Has assignment history. Mark it inactive instead.' : undefined,
    },
  ]

  return (
    <div className="flex items-center justify-end gap-1.5">
      {!canEdit ? null : asset.state === 'active' ? (
        <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => setConfirm('unassign')}>
          Unassign
        </Button>
      ) : (
        <Button
          size="sm"
          icon={<Send className="size-3.5" />}
          disabledReason={asset.state === 'inactive' ? 'Inactive. Reactivate it before issuing.' : undefined}
          onClick={() => setSheet('issue')}
        >
          Issue
        </Button>
      )}
      <Menu label={`More actions for ${asset.code}`} items={items} />
      {sheet === 'issue' && <DigitalIssueSheet asset={asset} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <DigitalAssetEditSheet asset={asset} onClose={() => setSheet(null)} />}
      {sheet === 'detail' && <DigitalAssetDetailSheet asset={asset} onClose={() => setSheet(null)} />}
      <ConfirmDialog
        open={confirm === 'unassign'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Unassign ${asset.code}?`}
        description={`${asset.type} is taken back from ${asset.employee?.name ?? 'its holder'} and becomes Not Issued. The assignment stays in its history.`}
        confirmLabel="Unassign"
        onConfirm={() => unassign.mutateAsync(asset.assignmentId)}
      />
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Mark ${asset.code} inactive?`}
        description="It cannot be issued until it is reactivated. Its history stays, and you can reactivate it at any time."
        confirmLabel="Mark inactive"
        onConfirm={() => deactivate.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${asset.code}?`}
        description="It has never been issued, so no history is lost. Its Asset ID is not used again. This is permanent and is written to the audit log."
        confirmLabel="Delete digital asset"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  )
}

const today = () => formatDate(new Date().toISOString())

/**
 * The instant sent for an issue date before today: the end of that day here, so a seat taken back and issued again on the
 * same earlier day keeps its order. Null if the date is not on the calendar.
 */
function endOfLocalDay(date: string): string | null {
  const end = new Date(`${date}T23:59:59`)
  return Number.isNaN(end.getTime()) || formatDate(end.toISOString()) !== date ? null : end.toISOString()
}

function DigitalIssueSheet({ asset, onClose }: { asset: DigitalAssetRow; onClose: () => void }) {
  const { data: lookups } = useQuery(digitalLookupsQuery)
  const people = lookups?.employees ?? []
  const [employee, setEmployee] = useState<EmployeeRef | null>(null)
  const [date, setDate] = useState(today)
  const [error, setError] = useState<ApiError | null>(null)
  const issue = useWrite(
    (body: Record<string, unknown>) => api.post<DigitalAssetRow>(`/digital-assets/${asset.id}/issue`, body),
    {
      silent: true,
      success: (row) => `${row.code} issued to ${row.employee?.name ?? 'the employee'}`,
    },
  )

  async function commit() {
    setError(null)
    if (!employee) return setError(invalidFields('Choose who it is issued to.', { employeeId: 'Choose an employee.' }))
    const now = today()
    // Today means now. Only an earlier day is sent as a date.
    const issuedAt = date === now ? undefined : endOfLocalDay(date)
    if (issuedAt === null) return setError(invalidFields('Enter a real date.', { issuedAt: 'Enter a real date.' }))
    if (date > now)
      return setError(
        invalidFields('The issue date cannot be in the future.', {
          issuedAt: 'The issue date cannot be in the future.',
        }),
      )
    try {
      await issue.mutateAsync({ employeeId: employee.id, issuedAt })
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Issue ${asset.code}`}
      description={`${asset.type} · ${asset.account}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="digital-issue-form" loading={issue.isPending}>
            Issue
          </Button>
        </>
      }
    >
      <form
        id="digital-issue-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void commit()
        }}
      >
        {error && !Object.keys(error.fields).length && (
          <Alert tone="bad" title="Could not issue it">
            {error.message}
          </Alert>
        )}
        <Field label="Employee" error={error?.fields.employeeId}>
          <Combobox
            items={people}
            value={employee}
            onChange={setEmployee}
            getKey={(person) => person.id}
            getLabel={(person) => person.name}
            getSearch={(person) => `${person.code} ${person.department ?? ''}`}
            placeholder="Search by name or employee ID"
            emptyText="No matching employees"
          />
        </Field>
        <Field
          label="Issue date"
          hint="Today unless it was issued earlier. It cannot be in the future."
          error={error?.fields.issuedAt}
        >
          <DateInput className="w-44" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

function DigitalAssetEditSheet({ asset, onClose }: { asset: DigitalAssetRow; onClose: () => void }) {
  const { data: lookups } = useQuery(digitalLookupsQuery)
  // A seat keeps its type when that type is deactivated, so the one it has is always on offer.
  const active = lookups?.digitalAssetTypes ?? []
  const types = active.some((type) => type.id === asset.typeId)
    ? active
    : [{ id: asset.typeId, name: asset.type }, ...active]
  const [error, setError] = useState<ApiError | null>(null)
  const save = useWrite(
    (body: { typeId: number; account: string }) => api.patch<DigitalAssetRow>(`/digital-assets/${asset.id}`, body),
    { silent: true, success: `${asset.code} updated` },
  )
  const form = useForm({
    defaultValues: { typeId: String(asset.typeId), account: asset.account },
    validators: {
      onSubmit: ({ value }) => {
        const problem = accountProblem(value.account)
        return problem ? { fields: { account: problem } } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await save.mutateAsync({ typeId: Number(value.typeId), account: value.account })
        onClose()
      } catch (e) {
        if (e instanceof ApiError) setError(e)
      }
    },
  })
  const submitted = form.state.submissionAttempts > 0

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${asset.code}`}
      description="The Asset ID never changes. Changes are written to the audit log."
      footer={
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="digital-edit-form" loading={submitting}>
                Save changes
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <form
        id="digital-edit-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        {error && !Object.keys(error.fields).length && (
          <Alert tone="bad" title="Could not save">
            {error.message}
          </Alert>
        )}
        <form.Field name="typeId">
          {(field) => (
            <Field label="Type" error={fieldError(field, error?.fields, submitted)}>
              <Select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </form.Field>
        <form.Field name="account">
          {(field) => (
            <Field label="License/Account" hint={ACCOUNT_HINT} error={fieldError(field, error?.fields, submitted)}>
              <Input
                value={field.state.value}
                autoComplete="off"
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </Field>
          )}
        </form.Field>
      </form>
    </Sheet>
  )
}

function DigitalAssetDetailSheet({ asset, onClose }: { asset: DigitalAssetRow; onClose: () => void }) {
  const { data, isPending } = useQuery(digitalAssetDetailQuery(asset.id))
  const current = data?.asset ?? asset
  const history = data?.history ?? []

  return (
    <Sheet
      open
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-mono">{current.code}</span>
          <DigitalStateBadge state={current.state} />
        </span>
      }
      description={`${current.type} · added ${formatDate(current.createdAt)}`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-6">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-3">License/Account</dt>
            <dd className="mt-1 break-words text-sm font-medium text-ink">{current.account}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-3">Assigned employee</dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {current.employee ? (
                <>
                  {current.employee.name}{' '}
                  <span className="font-normal text-ink-3">· since {formatDate(current.issuedAt)}</span>
                </>
              ) : (
                <span className="font-normal text-ink-3">Nobody</span>
              )}
            </dd>
          </div>
        </dl>
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-md font-semibold">Assignment history</h3>
            <p className="text-sm text-ink-3">
              {isPending ? 'Loading…' : `${plural(history.length, 'assignment')}. Nothing here is ever overwritten.`}
            </p>
          </div>
          {!isPending && history.length === 0 ? (
            <p className="rounded-control border border-line bg-sunken px-4 py-3 text-sm text-ink-3">
              Never issued. Once it is, each assignment is recorded here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-sunken text-xs text-ink-3">
                  <tr>
                    {['Employee', 'Issued', 'Unassigned', 'By'].map((heading) => (
                      <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.employee.name}</div>
                        <div className="text-xs text-ink-3">
                          {[row.employee.code, row.employee.department].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Mono className="text-ink-2">{formatDate(row.issuedAt)}</Mono>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {row.returnedAt ? (
                          <Mono className="text-ink-2">{formatDateTime(row.returnedAt)}</Mono>
                        ) : (
                          <Badge tone="accent">Still issued</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs leading-5 text-ink-2">
                        <div className="break-all">Issued by {row.issuedBy}</div>
                        {row.returnedBy && <div className="break-all">Unassigned by {row.returnedBy}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  )
}
