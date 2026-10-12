import { useForm } from '@tanstack/react-form'

import { Archive, ArchiveRestore, CornerDownLeft, Pencil, Send, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { SUPER_ADMIN_ONLY } from '@shared/permissions.ts'
import type { EmployeeRow } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { useWrite } from '@/features/common/hooks.ts'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { useCan } from '@/lib/session.ts'

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
  const set = (key: keyof Body) => (event: React.ChangeEvent<HTMLInputElement>) => setValue((v) => ({ ...v, [key]: event.target.value }))

  async function commit() {
    setError(null)
    const missing = (['code', 'firstName', 'lastName'] as const).find((key) => !value[key].trim())
    if (missing) {
      setError(new ApiError(422, { error: 'validation_failed', message: 'Employee ID, first name and last name are required.', details: { fields: { [missing]: 'Required' } } }, ''))
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

  const fieldMessage = (key: keyof Body) => error?.fields[key] ?? (key === 'code' && error?.code === 'duplicate_employee' ? error.message : null)

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
  const canArchive = useCan('employee.archive')
  const canDelete = useCan('record.delete')
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const archive = useWrite(() => api.post(`/employees/${employee.id}/archive`), { success: `${employee.name} archived` })
  const restore = useWrite(() => api.post(`/employees/${employee.id}/restore`), { success: `${employee.name} restored` })
  const remove = useWrite(() => api.delete(`/employees/${employee.id}`), { success: `${employee.name} deleted` })

  const items: MenuItem[] = [
    { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(true) },
    employee.state === 'archived'
      ? { label: 'Restore', icon: ArchiveRestore, onSelect: () => restore.mutate(undefined), disabledReason: canArchive ? undefined : SUPER_ADMIN_ONLY }
      : {
          label: 'Archive',
          icon: Archive,
          onSelect: () => setConfirm('archive'),
          disabledReason: !canArchive ? SUPER_ADMIN_ONLY : employee.assetsHeld > 0 ? `Holds ${employee.assetsHeld} asset${employee.assetsHeld === 1 ? '' : 's'}. Return them first.` : undefined,
        },
    {
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => setConfirm('delete'),
      disabledReason: !canDelete ? SUPER_ADMIN_ONLY : (employee.deleteBlocked ?? undefined),
    },
  ]

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" icon={<Send className="size-3.5" />} disabledReason={employee.state === 'archived' ? 'Archived employees cannot be issued assets.' : undefined} onClick={() => sheets.issue(undefined, employee.id)}>
        Issue to
      </Button>
      <Menu label={`More actions for ${employee.name}`} items={items} />
      {editing && <EmployeeEditSheet employee={employee} onClose={() => setEditing(false)} />}
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
  const save = useWrite((body: Body) => api.patch<EmployeeRow>(`/employees/${employee.id}`, body), { silent: true, success: `${employee.name} updated` })
  const form = useForm({
    defaultValues: { code: employee.code, firstName: employee.firstName, lastName: employee.lastName, department: employee.department ?? '', jobTitle: employee.jobTitle ?? '' } as Body,
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
        <Field label={label} optional={opts.optional} error={(name === 'code' && error?.code === 'duplicate_employee' ? error.message : null) ?? fieldError(field, undefined, submitted)}>
          <Input mono={opts.mono} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
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

