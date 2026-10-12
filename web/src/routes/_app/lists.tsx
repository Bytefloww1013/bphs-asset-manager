import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { RATING_ATTENTION_BELOW, RATING_DEFAULT_SCORE, RATING_SCORE_MAX, RATING_SCORE_MIN } from '@shared/constants.ts'
import { SUPER_ADMIN_ONLY } from '@shared/permissions.ts'
import type { AssetTypeRow, ConditionRatingRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, IconButton } from '@/components/ui/button.tsx'
import { Input, Switch } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
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

/** Why the last active item of a list can be neither switched off nor deleted. The server refuses it with the same rule. */
const onlyActiveReason = (kind: Kind) => `The only active ${kind === 'asset-types' ? 'type' : 'rating'}. Activate or add another first.`
/** True for the one row that is active when no other row is. */
const isOnlyActive = <T extends { isActive: boolean }>(info: { row: { original: T }; table: { getCoreRowModel: () => { rows: { original: T }[] } } }) =>
  info.row.original.isActive && info.table.getCoreRowModel().rows.filter((row) => row.original.isActive).length === 1

function DeleteButton({ kind, id, name, inUse, inUseReason, onlyActive }: { kind: Kind; id: number; name: string; inUse: boolean; inUseReason: string; onlyActive: boolean }) {
  const can = useCan('record.delete')
  const [open, setOpen] = useState(false)
  const remove = useWrite(() => api.delete(`/${kind}/${id}`), { success: `${name} deleted` })
  return (
    <>
      <IconButton label={`Delete ${name}`} size="sm" variant="danger-ghost" disabledReason={!can ? SUPER_ADMIN_ONLY : inUse ? inUseReason : onlyActive ? onlyActiveReason(kind) : undefined} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </IconButton>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={`Delete "${name}"?`} description="Nothing references it, so no history is lost. This is written to the audit log." confirmLabel="Delete" tone="danger" onConfirm={() => remove.mutateAsync(undefined)} />
    </>
  )
}

function ActiveSwitch({ kind, id, name, active, onlyActive }: { kind: Kind; id: number; name: string; active: boolean; onlyActive: boolean }) {
  const toggle = useWrite((isActive: boolean) => api.patch(`/${kind}/${id}`, { isActive }))
  return <Switch label={`${name} is ${active ? 'active' : 'inactive'}`} checked={active} disabled={toggle.isPending} disabledReason={onlyActive ? onlyActiveReason(kind) : undefined} onChange={(next) => toggle.mutate(next)} />
}

const t = columnsFor<AssetTypeRow>()
const typeColumns = [
  t.accessor('name', { header: 'Name', cell: (info) => <EditableName kind="asset-types" id={info.row.original.id} name={info.getValue()} /> }),
  t.accessor('assetCount', { header: 'Assets', cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue()}</span>, meta: { align: 'right' } }),
  t.accessor('isActive', { header: 'Active', cell: (info) => <ActiveSwitch kind="asset-types" id={info.row.original.id} name={info.row.original.name} active={info.getValue()} onlyActive={isOnlyActive(info)} />, enableSorting: false }),
  t.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => <DeleteButton kind="asset-types" id={info.row.original.id} name={info.row.original.name} inUse={info.row.original.assetCount > 0} inUseReason={`${info.row.original.assetCount} assets use this type. Deactivate it instead.`} onlyActive={isOnlyActive(info)} />,
    meta: { align: 'right', width: 'w-14', cellClassName: 'max-sm:pl-0' },
  }),
]

/** Click the pencil to change the score in place; Enter saves, Esc cancels. The table re-sorts itself, best first. */
function EditableScore({ id, name, score }: { id: number; name: string; score: number }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(score))
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const save = useWrite((value: number) => api.patch(`/condition-ratings/${id}`, { score: value }), { silent: true })

  async function commit() {
    if (draft.trim() === String(score)) return setEditing(false)
    try {
      await save.mutateAsync(toScore(draft))
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the score.')
    }
  }

  if (!editing) {
    return (
      <div className="group flex items-center gap-1">
        <Mono className="w-7 text-right font-medium">{score}</Mono>
        <IconButton
          label={`Change the score of ${name}`}
          size="sm"
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => {
            setDraft(String(score))
            setError(null)
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
          inputMode="numeric"
          aria-label={`New score for ${name}, 1 to 100`}
          aria-invalid={error ? true : undefined}
          className="h-8 w-16"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
        <IconButton label="Save score" size="sm" variant="secondary" onClick={() => void commit()} loading={save.isPending}>
          <Check className="size-4" />
        </IconButton>
        <IconButton label="Cancel score change" size="sm" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </IconButton>
      </div>
      {error && <p role="alert" className="mt-1 whitespace-normal text-xs font-medium text-bad">{error}</p>}
    </div>
  )
}

/** What was typed, as a number. Anything that is not a whole number is sent as it is not, so the server's message explains the rule. */
const toScore = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

function AddRating() {
  const [name, setName] = useState('')
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useWrite((value: { name: string; score: number | null }) => api.post('/condition-ratings', value), { silent: true, success: 'Rating added' })
  return (
    <form
      className="px-5 pb-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim()) return
        try {
          const value = toScore(score)
          await add.mutateAsync({ name, score: Number.isNaN(value) ? null : value })
          setName('')
          setScore('')
          setError(null)
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not add that.')
        }
      }}
    >
      <div className="flex gap-2">
        <Input aria-label="New rating name" aria-invalid={error ? true : undefined} placeholder="New rating name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input aria-label="Score for the new rating, 1 to 100" aria-invalid={error ? true : undefined} inputMode="numeric" placeholder="Score" className="w-20 shrink-0" value={score} onChange={(event) => setScore(event.target.value)} />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={add.isPending}>
          Add
        </Button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
    </form>
  )
}

const r = columnsFor<ConditionRatingRow>()
const ratingColumns = [
  r.accessor('name', { header: 'Name', enableSorting: false, cell: (info) => <EditableName kind="condition-ratings" id={info.row.original.id} name={info.getValue()} tone={ratingTone(info.row.original.score)} /> }),
  r.accessor('score', { header: 'Score', enableSorting: false, cell: (info) => <EditableScore id={info.row.original.id} name={info.row.original.name} score={info.getValue()} /> }),
  r.accessor('snapshotCount', { header: 'Records', enableSorting: false, cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue().toLocaleString()}</span>, meta: { align: 'right', hideBelow: 'sm' } }),
  r.accessor('isActive', { header: 'Active', enableSorting: false, cell: (info) => <ActiveSwitch kind="condition-ratings" id={info.row.original.id} name={info.row.original.name} active={info.getValue()} onlyActive={isOnlyActive(info)} /> }),
  r.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => <DeleteButton kind="condition-ratings" id={info.row.original.id} name={info.row.original.name} inUse={info.row.original.snapshotCount > 0} inUseReason={`${info.row.original.snapshotCount} condition records use this rating. Deactivate it instead.`} onlyActive={isOnlyActive(info)} />,
    meta: { align: 'right', width: 'w-14', cellClassName: 'max-sm:pl-0' },
  }),
]

function ListsPage() {
  usePageTitle('Lists')
  const { data: types = [] } = useQuery(assetTypesQuery)
  const { data: ratings = [] } = useQuery(ratingsQuery)
  const typeTable = useGrid({ data: types, columns: typeColumns, getRowId: (row) => String(row.id), pageSize: 100 })
  const ratingTable = useGrid({ data: ratings, columns: ratingColumns, getRowId: (row) => String(row.id), pageSize: 100 })

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
          <div className="flex flex-col gap-1.5 px-5 pb-4 text-sm leading-5 text-ink-2">
            <p>
              Each rating has a score from {RATING_SCORE_MIN} to {RATING_SCORE_MAX}: {RATING_SCORE_MAX} is as good as new, {RATING_SCORE_MIN} is beyond use. The score is what the rating means, whatever it is called. It sets the order of the scale and the colour of the badge, and no two ratings can share one.
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <li><Badge tone="accent">90 to 100</Badge></li>
              <li><Badge tone="ok">70 to 89</Badge></li>
              <li><Badge tone="warn">{RATING_ATTENTION_BELOW} to 69</Badge></li>
              <li><Badge tone="bad">Below {RATING_ATTENTION_BELOW}</Badge></li>
            </ul>
            <p>
              Assets rated below {RATING_ATTENTION_BELOW} are listed under Condition watch on the overview. The rating closest to {RATING_DEFAULT_SCORE} is the one forms start on. Scores are shown only on this page.
            </p>
          </div>
          <AddRating />
          <DataGrid table={ratingTable} label="Condition ratings" noun="ratings" empty={null} className="rounded-none border-0 border-t shadow-none" />
        </Panel>
      </div>
    </div>
  )
}
