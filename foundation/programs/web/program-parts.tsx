import { useForm } from '@tanstack/react-form'
import { Archive, ArchiveRestore, CornerDownLeft, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Slot } from '@/components/slot.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { plural } from '@/lib/format.ts'
import { useWrite } from '@/lib/hooks.ts'
import { useDenied } from '@/lib/session.ts'
import type { ProgramRow } from '../shared/index.ts'
import {
  createProgram,
  deactivateProgram,
  deleteProgram,
  reactivateProgram,
  updateProgram,
  type ProgramBody,
} from './api.ts'

const EMPTY: ProgramBody = { name: '', code: '', address: '' }

export const ProgramStatus = ({ program }: { program: ProgramRow }) => (
  <Badge tone={program.isActive ? 'ok' : 'neutral'}>{program.isActive ? 'Active' : 'Deactivated'}</Badge>
)

export function QuickAddProgram({ onAdded }: { onAdded: (id: number) => void }) {
  const toast = useToast()
  const nameRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState<ProgramBody>(EMPTY)
  const [error, setError] = useState<ApiError | null>(null)
  const add = useWrite(createProgram, { silent: true })
  const set = (key: keyof ProgramBody) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue((v) => ({ ...v, [key]: event.target.value }))

  async function commit() {
    setError(null)
    const missing = (['name', 'code'] as const).find((key) => !value[key].trim())
    if (missing) {
      setError(
        new ApiError(
          422,
          {
            error: 'validation_failed',
            message: 'Program name and Program ID are required.',
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
      setValue(EMPTY)
      nameRef.current?.focus()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Add program</h2>
        <p className="text-sm text-ink-3">Program name and Program ID are required. Enter adds it.</p>
      </div>
      <form
        className="mt-4 grid items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-12"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void commit()
        }}
      >
        <Field label="Program name" error={error?.fields.name} className="lg:col-span-4">
          <Input ref={nameRef} value={value.name} onChange={set('name')} autoComplete="off" />
        </Field>
        <Field label="Program ID" error={error?.fields.code} className="lg:col-span-2">
          <Input mono placeholder="P-100" value={value.code} onChange={set('code')} autoComplete="off" />
        </Field>
        <Field label="Program address" optional error={error?.fields.address} className="lg:col-span-5">
          <Input value={value.address} onChange={set('address')} autoComplete="off" />
        </Field>
        <div className="sm:col-span-2 lg:col-span-1">
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

/** The program's status and what it holds, then its actions. The grid keeps its three columns for the program itself. */
export function ProgramRowActions({ program }: { program: ProgramRow }) {
  const noEdit = useDenied('assets', 'edit')
  const noFull = useDenied('assets', 'full')
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const deactivate = useWrite(() => deactivateProgram(program.id), {
    success: `${program.name} deactivated`,
  })
  const reactivate = useWrite(() => reactivateProgram(program.id), {
    success: `${program.name} reactivated`,
  })
  const remove = useWrite(() => deleteProgram(program.id), { success: `${program.name} deleted` })

  const items: MenuItem[] = [
    { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(true), disabledReason: noEdit },
    program.isActive
      ? {
          label: 'Deactivate',
          icon: Archive,
          onSelect: () => setConfirm('deactivate'),
          disabledReason:
            noEdit ??
            (program.assetsHeld > 0 ? `Holds ${plural(program.assetsHeld, 'asset')}. Return them first.` : undefined),
        }
      : {
          label: 'Reactivate',
          icon: ArchiveRestore,
          onSelect: () => reactivate.mutate(undefined),
          disabledReason: noEdit,
        },
    {
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => setConfirm('delete'),
      disabledReason: noFull ?? program.deleteBlocked ?? undefined,
    },
  ]

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="mr-1.5 hidden items-center gap-2.5 whitespace-nowrap sm:flex">
        <span className={program.assetsHeld ? 'text-sm tabular-nums text-ink-2' : 'text-sm tabular-nums text-ink-3'}>
          {program.assetsHeld} held
        </span>
        <ProgramStatus program={program} />
      </span>
      {/* The Assign button, from the assets module. */}
      <Slot name="program.actions" props={{ program }} />
      <Menu label={`More actions for ${program.name}`} items={items} />
      {editing && <ProgramEditSheet program={program} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Deactivate ${program.name}?`}
        description="It disappears from the pickers but its assignment history stays. You can reactivate it at any time."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${program.name}?`}
        description="It has never held an asset, so nothing else is lost. This is permanent and is written to the audit log."
        confirmLabel="Delete program"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  )
}

export function ProgramEditSheet({ program, onClose }: { program: ProgramRow; onClose: () => void }) {
  const [error, setError] = useState<ApiError | null>(null)
  const save = useWrite((body: ProgramBody) => updateProgram(program.id, body), {
    silent: true,
    success: `${program.name} updated`,
  })
  const form = useForm({
    defaultValues: { name: program.name, code: program.code, address: program.address ?? '' },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.name.trim()) fields.name = 'Required'
        if (!value.code.trim()) fields.code = 'Required'
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
  const text = (
    name: keyof ProgramBody,
    label: string,
    opts: { optional?: boolean; mono?: boolean; autoFocus?: boolean } = {},
  ) => (
    <form.Field name={name}>
      {(field) => (
        <Field label={label} optional={opts.optional} error={fieldError(field, error?.fields, submitted)}>
          <Input
            mono={opts.mono}
            autoFocus={opts.autoFocus}
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
      title={`Edit ${program.name}`}
      description="Changes are written to the audit log."
      footer={
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="program-edit-form" loading={submitting}>
                Save changes
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <form
        id="program-edit-form"
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
        {text('name', 'Program name', { autoFocus: true })}
        {text('code', 'Program ID', { mono: true })}
        {text('address', 'Program address', { optional: true })}
      </form>
    </Sheet>
  )
}
