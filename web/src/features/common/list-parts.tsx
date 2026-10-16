import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Section } from '@shared/constants.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, IconButton } from '@/components/ui/button.tsx'
import { Input, Switch } from '@/components/ui/form.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import type { ratingTone } from '@/features/common/status.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { useDenied } from '@/lib/session.ts'

// The parts of an editable list of names: the lists on the Lists screen, and the grievance categories.

/** Where the list is served from, under /api. */
export type ListKind = 'asset-types' | 'digital-asset-types' | 'condition-ratings' | 'grievances/categories'

/** Grievance categories belong to Grievances; the other lists to Assets. */
const sectionOf = (kind: ListKind): Section => (kind === 'grievances/categories' ? 'grievances' : 'assets')

const itemNoun = (kind: ListKind) => (kind === 'condition-ratings' ? 'rating' : kind === 'grievances/categories' ? 'category' : 'type')

/** Click the pencil to rename in place; Enter saves, Esc cancels. */
export function EditableName({ kind, id, name, tone }: { kind: ListKind; id: number; name: string; tone?: ReturnType<typeof ratingTone> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const save = useWrite((value: string) => api.patch(`/${kind}/${id}`, { name: value }), { silent: true })
  const readOnly = useDenied(sectionOf(kind), 'edit')

  async function commit() {
    if (draft.trim() === name) return setEditing(false)
    try {
      await save.mutateAsync(draft)
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not rename.')
    }
  }

  if (!editing) {
    return (
      <div className="group flex items-center gap-2">
        {tone ? <Badge tone={tone}>{name}</Badge> : <span className="font-medium">{name}</span>}
        {!readOnly && <IconButton
          label={`Rename ${name}`}
          size="sm"
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => {
            setDraft(name)
            setEditing(true)
            setTimeout(() => ref.current?.select(), 0)
          }}
        >
          <Pencil className="size-3.5" />
        </IconButton>}
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Input
          ref={ref}
          autoFocus
          aria-label={`New name for ${name}`}
          aria-invalid={error ? true : undefined}
          className="h-8 max-w-48"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
        <IconButton label="Save name" size="sm" variant="secondary" onClick={() => void commit()} loading={save.isPending}>
          <Check className="size-4" />
        </IconButton>
        <IconButton label="Cancel rename" size="sm" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </IconButton>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-bad">{error}</p>}
    </div>
  )
}

export function AddRow({ kind, placeholder, noun }: { kind: ListKind; placeholder: string; noun: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useWrite((value: string) => api.post(`/${kind}`, { name: value }), { silent: true, success: `${noun} added` })
  if (useDenied(sectionOf(kind), 'edit')) return null
  return (
    <form
      className="px-5 pb-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim()) return
        try {
          await add.mutateAsync(name)
          setName('')
          setError(null)
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not add that.')
        }
      }}
    >
      <div className="flex gap-2">
        <Input aria-label={placeholder} aria-invalid={error ? true : undefined} placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={add.isPending}>
          Add
        </Button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
    </form>
  )
}

/** Why the last active item of a list can be neither switched off nor deleted. The server refuses it with the same rule. */
const onlyActiveReason = (kind: ListKind) => `The only active ${itemNoun(kind)}. Activate or add another first.`
/** True for the one row that is active when no other row is. */
export const isOnlyActive = <T extends { isActive: boolean }>(info: { row: { original: T }; table: { getCoreRowModel: () => { rows: { original: T }[] } } }) =>
  info.row.original.isActive && info.table.getCoreRowModel().rows.filter((row) => row.original.isActive).length === 1

export function DeleteButton({ kind, id, name, inUse, inUseReason, onlyActive }: { kind: ListKind; id: number; name: string; inUse: boolean; inUseReason: string; onlyActive: boolean }) {
  const noFull = useDenied(sectionOf(kind), 'full')
  const [open, setOpen] = useState(false)
  const remove = useWrite(() => api.delete(`/${kind}/${id}`), { success: `${name} deleted` })
  return (
    <>
      <IconButton label={`Delete ${name}`} size="sm" variant="danger-ghost" disabledReason={noFull ?? (inUse ? inUseReason : onlyActive ? onlyActiveReason(kind) : undefined)} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Delete "${name}"?`} description={`Nothing references it, so no history is lost. This is written to the ${kind === 'grievances/categories' ? 'Grievance Audit Log' : 'audit log'}.`} confirmLabel="Delete" tone="danger" onConfirm={() => remove.mutateAsync(undefined)} />
    </>
  )
}

export function ActiveSwitch({ kind, id, name, active, onlyActive }: { kind: ListKind; id: number; name: string; active: boolean; onlyActive: boolean }) {
  const toggle = useWrite((isActive: boolean) => api.patch(`/${kind}/${id}`, { isActive }))
  const noEdit = useDenied(sectionOf(kind), 'edit')
  return <Switch label={`${name} is ${active ? 'active' : 'inactive'}`} checked={active} disabled={toggle.isPending} disabledReason={noEdit ?? (onlyActive ? onlyActiveReason(kind) : undefined)} onChange={(next) => toggle.mutate(next)} />
}
