import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { SUPER_ADMIN_ONLY } from '@shared/permissions.ts'
import type { AssetTypeRow, ConditionRatingRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, IconButton } from '@/components/ui/button.tsx'
import { Input, Switch } from '@/components/ui/form.tsx'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ratingTone } from '@/features/common/status.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { assetTypesQuery, ratingsQuery } from '@/lib/queries.ts'
import { useCan, usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/lists')({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(assetTypesQuery), context.queryClient.ensureQueryData(ratingsQuery)]),
  component: ListsPage,
})

type Kind = 'asset-types' | 'condition-ratings'

/** Click the pencil to rename in place; Enter saves, Esc cancels. */
function EditableName({ kind, id, name, tone }: { kind: Kind; id: number; name: string; tone?: ReturnType<typeof ratingTone> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const save = useWrite((value: string) => api.patch(`/${kind}/${id}`, { name: value }), { silent: true })

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
        <IconButton
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
        </IconButton>
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

function AddRow({ kind, placeholder, noun }: { kind: Kind; placeholder: string; noun: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useWrite((value: string) => api.post(`/${kind}`, { name: value }), { silent: true, success: `${noun} added` })
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

function DeleteButton({ kind, id, name, inUse, inUseReason }: { kind: Kind; id: number; name: string; inUse: boolean; inUseReason: string }) {
  const can = useCan('record.delete')
  const [open, setOpen] = useState(false)
  const remove = useWrite(() => api.delete(`/${kind}/${id}`), { success: `${name} deleted` })
  return (
    <>
      <IconButton label={`Delete ${name}`} size="sm" variant="danger-ghost" disabledReason={!can ? SUPER_ADMIN_ONLY : inUse ? inUseReason : undefined} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Delete "${name}"?`} description="Nothing references it, so no history is lost. This is written to the audit log." confirmLabel="Delete" tone="danger" onConfirm={() => remove.mutateAsync(undefined)} />
    </>
  )
}

function ActiveSwitch({ kind, id, name, active }: { kind: Kind; id: number; name: string; active: boolean }) {
  const toggle = useWrite((isActive: boolean) => api.patch(`/${kind}/${id}`, { isActive }))
  return <Switch label={`${name} is ${active ? 'active' : 'inactive'}`} checked={active} disabled={toggle.isPending} onChange={(next) => toggle.mutate(next)} />
}

const t = columnsFor<AssetTypeRow>()
const typeColumns = [
  t.accessor('name', { header: 'Name', cell: (info) => <EditableName kind="asset-types" id={info.row.original.id} name={info.getValue()} /> }),
  t.accessor('assetCount', { header: 'Assets', cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue()}</span>, meta: { align: 'right' } }),
  t.accessor('isActive', { header: 'Active', cell: (info) => <ActiveSwitch kind="asset-types" id={info.row.original.id} name={info.row.original.name} active={info.getValue()} />, enableSorting: false }),
  t.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => <DeleteButton kind="asset-types" id={info.row.original.id} name={info.row.original.name} inUse={info.row.original.assetCount > 0} inUseReason={`${info.row.original.assetCount} assets use this type. Deactivate it instead.`} />,
    meta: { align: 'right', width: 'w-14' },
  }),
]

function MoveButtons({ row, rows }: { row: ConditionRatingRow; rows: ConditionRatingRow[] }) {
  const index = rows.findIndex((r) => r.id === row.id)
  const move = useWrite((ids: number[]) => api.put('/condition-ratings/order', { ids }))
  const swap = (by: number) => {
    const ids = rows.map((r) => r.id)
    const target = index + by
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    move.mutate(ids)
  }
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={`Move ${row.name} up`} size="sm" disabled={index === 0 || move.isPending} onClick={() => swap(-1)}>
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton label={`Move ${row.name} down`} size="sm" disabled={index === rows.length - 1 || move.isPending} onClick={() => swap(1)}>
        <ArrowDown className="size-4" />
      </IconButton>
    </div>
  )
}

function RatingsTable({ rows }: { rows: ConditionRatingRow[] }) {
  const r = columnsFor<ConditionRatingRow>()
  // The move buttons need the current order, so the columns follow `rows` (and only then).
  const columns = useMemo(() => [
    r.display({ id: 'order', header: 'Order', cell: (info) => <MoveButtons row={info.row.original} rows={rows} />, meta: { width: 'w-24' } }),
    r.accessor('name', { header: 'Name', enableSorting: false, cell: (info) => <EditableName kind="condition-ratings" id={info.row.original.id} name={info.getValue()} tone={ratingTone(info.getValue())} /> }),
    r.accessor('snapshotCount', { header: 'Records', enableSorting: false, cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue().toLocaleString()}</span>, meta: { align: 'right' } }),
    r.accessor('isActive', { header: 'Active', enableSorting: false, cell: (info) => <ActiveSwitch kind="condition-ratings" id={info.row.original.id} name={info.row.original.name} active={info.getValue()} /> }),
    r.display({
      id: 'actions',
      header: () => <span className="sr-only">Delete</span>,
      cell: (info) => <DeleteButton kind="condition-ratings" id={info.row.original.id} name={info.row.original.name} inUse={info.row.original.snapshotCount > 0} inUseReason={`${info.row.original.snapshotCount} condition records use this rating. Deactivate it instead.`} />,
      meta: { align: 'right', width: 'w-14' },
    }),
  ], [rows])
  const table = useGrid({ data: rows, columns, getRowId: (row) => String(row.id), pageSize: 100 })
  return <DataGrid table={table} label="Condition ratings" noun="ratings" empty={null} className="rounded-none border-0 border-t shadow-none" />
}

function ListsPage() {
  usePageTitle('Lists')
  const { data: types = [] } = useQuery(assetTypesQuery)
  const { data: ratings = [] } = useQuery(ratingsQuery)
  const typeTable = useGrid({ data: types, columns: typeColumns, getRowId: (row) => String(row.id), pageSize: 100 })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lists" description="The choices offered when adding assets and recording condition. Deactivate instead of deleting anything that is in use." />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader title="Asset types" description={`${types.length} types, ${types.filter((x) => x.isActive).length} active`} />
          <AddRow kind="asset-types" placeholder="New type name" noun="Type" />
          <DataGrid table={typeTable} label="Asset types" noun="types" empty={null} className="rounded-none border-0 border-t shadow-none" />
        </Panel>
        <Panel className="overflow-hidden">
          <PanelHeader title="Condition ratings" description="Best first. This order is the scale shown when issuing and returning." />
          <AddRow kind="condition-ratings" placeholder="New rating name" noun="Rating" />
          <RatingsTable rows={ratings} />
        </Panel>
      </div>
    </div>
  )
}
