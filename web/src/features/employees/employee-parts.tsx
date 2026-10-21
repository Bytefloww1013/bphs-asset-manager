import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'

import { Archive, ArchiveRestore, CornerDownLeft, PackageSearch, Pencil, Send, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { openReviewWork } from '@shared/constants.ts'
import type { EmployeeRow } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { Mono, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { useWrite } from '@/features/common/hooks.ts'
import { AssetTagLink } from '@/features/common/status.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { formatDate, plural } from '@/lib/format.ts'
import { assetsQuery, digitalAssetsQuery } from '@/lib/queries.ts'
import { useDenied } from '@/lib/session.ts'
import { useWorkspace } from '@/lib/workspace.ts'

interface Body {
  code: string
  firstName: string
  lastName: string
  department: string
  jobTitle: string
}

export function QuickAddEmployee({ onAdded }: { onAdded: (id: number) => void }) {
  const toast = useToast()
  const codeRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState<Body>({ code: '', firstName: '', lastName: '', department: '', jobTitle: '' })
  const [error, setError] = useState<ApiError | null>(null)
  const add = useWrite((body: Body) => api.post<EmployeeRow>('/employees', body), { silent: true })
  const set = (key: keyof Body) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue((v) => ({ ...v, [key]: event.target.value }))

  async function commit() {
    setError(null)
    const missing = (['code', 'firstName', 'lastName'] as const).find((key) => !value[key].trim())
    if (missing) {
      setError(
        new ApiError(
          422,
          {
            error: 'validation_failed',
            message: 'Employee ID, first name and last name are required.',
            details: { fields: { [missing]: 'Required' } },
          },
          '',
        ),
      )
      return
    }
    try {
      const row = await add.mutateAsync(value)
      toast({ title: `${row.name} added`, description: row.code })
      onAdded(row.id)
      setValue({ code: '', firstName: '', lastName: '', department: '', jobTitle: '' })
      codeRef.current?.focus()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  const fieldMessage = (key: keyof Body) =>
    error?.fields[key] ?? (key === 'code' && error?.code === 'duplicate_employee' ? error.message : null)

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Add employee</h2>
        <p className="text-sm text-ink-3">Employee ID, first name and last name are required. Enter adds them.</p>
      </div>
      <form
        className="mt-4 grid items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-12"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void commit()
        }}
      >
        <Field label="Employee ID" error={fieldMessage('code')} className="lg:col-span-2">
          <Input ref={codeRef} mono placeholder="E-1416" value={value.code} onChange={set('code')} autoComplete="off" />
        </Field>
        <Field label="First name" error={fieldMessage('firstName')} className="lg:col-span-2">
          <Input value={value.firstName} onChange={set('firstName')} autoComplete="off" />
        </Field>
        <Field label="Last name" error={fieldMessage('lastName')} className="lg:col-span-2">
          <Input value={value.lastName} onChange={set('lastName')} autoComplete="off" />
        </Field>
        <Field label="Department" optional className="lg:col-span-2">
          <Input value={value.department} onChange={set('department')} autoComplete="off" />
        </Field>
        <Field label="Job title" optional className="lg:col-span-3">
          <Input value={value.jobTitle} onChange={set('jobTitle')} autoComplete="off" />
        </Field>
        <div className="sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="primary" className="w-full" loading={add.isPending}>
            Add <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />
          </Button>
        </div>
      </form>
      {error && !Object.keys(error.fields).length && error.code !== 'duplicate_employee' && (
        <Alert tone="bad" className="mt-4">
          {error.message}
        </Alert>
      )}
    </Panel>
  )
}

export function EmployeeRowActions({ employee }: { employee: EmployeeRow }) {
  const sheets = useSheetActions()
  // In Grievances, an employee is a person to name, not someone who holds equipment.
  const assets = useWorkspace() === 'assets'
  const noEdit = useDenied('employees', 'edit')
  const noFull = useDenied('employees', 'full')
  const noIssue = useDenied('assets', 'edit')
  const [editing, setEditing] = useState(false)
  const [holdings, setHoldings] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const archive = useWrite(() => api.post(`/employees/${employee.id}/archive`), {
    success: `${employee.name} archived`,
  })
  const restore = useWrite(() => api.post(`/employees/${employee.id}/restore`), {
    success: `${employee.name} restored`,
  })
  const remove = useWrite(() => api.delete(`/employees/${employee.id}`), { success: `${employee.name} deleted` })
  const openReviews = employee.openReviewsReviewing + employee.openCapsResponsible

  const items: MenuItem[] = [
    ...(assets ? [{ label: 'What they hold', icon: PackageSearch, onSelect: () => setHoldings(true) }] : []),
    { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(true), disabledReason: noEdit },
    employee.state === 'archived'
      ? { label: 'Restore', icon: ArchiveRestore, onSelect: () => restore.mutate(undefined), disabledReason: noFull }
      : {
          label: 'Archive',
          icon: Archive,
          onSelect: () => setConfirm('archive'),
          disabledReason: noFull
            ? noFull
            : employee.assetsHeld > 0
              ? `Holds ${employee.assetsHeld} asset${employee.assetsHeld === 1 ? '' : 's'}. Return them first.`
              : employee.digitalHeld > 0
                ? `Holds ${plural(employee.digitalHeld, 'digital asset')}. Unassign them first.`
                : employee.openGrievancesOwned > 0
                  ? `Owns ${plural(employee.openGrievancesOwned, 'grievance')} not yet closed. Give ${employee.openGrievancesOwned === 1 ? 'it' : 'them'} to another owner first.`
                  : openReviews > 0
                    ? `Is ${openReviewWork(employee.openReviewsReviewing, employee.openCapsResponsible)}. Give ${openReviews === 1 ? 'it' : 'them'} to someone else first.`
                    : undefined,
        },
    {
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => setConfirm('delete'),
      disabledReason: noFull ?? employee.deleteBlocked ?? undefined,
    },
  ]

  return (
    <div className="flex items-center justify-end gap-1.5">
      {assets && (
        <Button
          size="sm"
          icon={<Send className="size-3.5" />}
          disabledReason={
            noIssue ?? (employee.state === 'archived' ? 'Archived employees cannot be issued assets.' : undefined)
          }
          onClick={() => sheets.issue(undefined, employee.id)}
        >
          Issue to
        </Button>
      )}
      <Menu label={`More actions for ${employee.name}`} items={items} />
      {editing && <EmployeeEditSheet employee={employee} onClose={() => setEditing(false)} />}
      {holdings && <EmployeeHoldingsSheet employee={employee} onClose={() => setHoldings(false)} />}
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Archive ${employee.name}?`}
        description="They disappear from the pickers but their assignment history stays. You can restore them at any time."
        confirmLabel="Archive"
        onConfirm={() => archive.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${employee.name}?`}
        description="They have no history, so nothing else is lost. This is permanent and is written to the audit log."
        confirmLabel="Delete employee"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  )
}

export function EmployeeEditSheet({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const [error, setError] = useState<ApiError | null>(null)
  const save = useWrite((body: Body) => api.patch<EmployeeRow>(`/employees/${employee.id}`, body), {
    silent: true,
    success: `${employee.name} updated`,
  })
  const form = useForm({
    defaultValues: {
      code: employee.code,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department ?? '',
      jobTitle: employee.jobTitle ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.code.trim()) fields.code = 'Required'
        if (!value.firstName.trim()) fields.firstName = 'Required'
        if (!value.lastName.trim()) fields.lastName = 'Required'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await save.mutateAsync(value)
        onClose()
      } catch (e) {
        if (e instanceof ApiError) setError(e)
      }
    },
  })
  const submitted = form.state.submissionAttempts > 0
  const text = (name: keyof Body, label: string, opts: { optional?: boolean; mono?: boolean } = {}) => (
    <form.Field name={name}>
      {(field) => (
        <Field
          label={label}
          optional={opts.optional}
          error={
            (name === 'code' && error?.code === 'duplicate_employee' ? error.message : null) ??
            fieldError(field, undefined, submitted)
          }
        >
          <Input
            mono={opts.mono}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
          />
        </Field>
      )}
    </form.Field>
  )

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${employee.name}`}
      description="Changes are written to the audit log."
      footer={
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="employee-edit-form" loading={submitting}>
                Save changes
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <form
        id="employee-edit-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        {error && error.code !== 'duplicate_employee' && (
          <Alert tone="bad" title="Could not save">
            {error.message}
          </Alert>
        )}
        {text('code', 'Employee ID', { mono: true })}
        <div className="grid gap-5 sm:grid-cols-2">
          {text('firstName', 'First name')}
          {text('lastName', 'Last name')}
        </div>
        {text('department', 'Department', { optional: true })}
        {text('jobTitle', 'Job title', { optional: true })}
      </form>
    </Sheet>
  )
}

/** Everything an employee has out, physical and digital, so offboarding shows all there is to reclaim. */
function EmployeeHoldingsSheet({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const { data: assets, isPending: assetsPending } = useQuery(assetsQuery)
  const { data: seats, isPending: seatsPending } = useQuery(digitalAssetsQuery)
  const physical = (assets ?? []).filter((asset) => asset.holder?.id === employee.id)
  const digital = (seats ?? []).filter((seat) => seat.employee?.id === employee.id)
  const nothing = !assetsPending && !seatsPending && physical.length + digital.length === 0

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`What ${employee.name} holds`}
      description={nothing ? 'Nothing is out with them.' : 'Return or unassign each of these before archiving them.'}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="held-physical">
          <h3 id="held-physical" className="text-sm font-semibold">
            Physical assets <span className="font-normal text-ink-3">{assetsPending ? '' : physical.length}</span>
          </h3>
          {physical.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{assetsPending ? 'Loading…' : 'None.'}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-control border border-line">
              {physical.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <AssetTagLink tag={asset.tag} />
                  <span className="min-w-0 truncate text-ink-2">{asset.type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="held-digital">
          <h3 id="held-digital" className="text-sm font-semibold">
            Digital assets <span className="font-normal text-ink-3">{seatsPending ? '' : digital.length}</span>
          </h3>
          {digital.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{seatsPending ? 'Loading…' : 'None.'}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-control border border-line">
              {digital.map((seat) => (
                <li
                  key={seat.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm"
                >
                  <Mono className="font-medium">{seat.code}</Mono>
                  <span className="min-w-0">
                    <span className="block truncate">{seat.type}</span>
                    <span className="block truncate text-xs text-ink-3">{seat.account}</span>
                  </span>
                  <span className="text-xs text-ink-3">since {formatDate(seat.issuedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}
