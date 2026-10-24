// The assets' lookup lists, as editors on the Lookup lists page: types and brands in the main column, condition ratings beside them.
import { useQuery } from '@tanstack/react-query'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { ActiveSwitch, DeleteButton, EditableName, isOnlyActive, type ListKind } from '@/components/list-parts.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, IconButton } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/form.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { useWrite } from '@/lib/hooks.ts'
import { useCan } from '@/lib/session.ts'
import type { ListEditor } from '@/modules.ts'
import {
  type ConditionRatingRow,
  RATING_ATTENTION_BELOW,
  RATING_DEFAULT_SCORE,
  RATING_SCORE_MAX,
  RATING_SCORE_MIN,
} from '../shared/index.ts'
import { nameListColumns, NameList } from './name-list.tsx'
import { assetBrandsQuery, assetTypesQuery, ratingsQuery } from './queries.ts'
import { ratingTone } from './status.tsx'

// The lists, guarded by Assets; their changes are written to the audit log.
const ASSET_TYPES: ListKind = { path: 'asset-types', section: 'assets', noun: 'type', log: 'audit log' }
const ASSET_BRANDS: ListKind = { path: 'asset-brands', section: 'assets', noun: 'brand', log: 'audit log' }
const RATINGS: ListKind = { path: 'condition-ratings', section: 'assets', noun: 'rating', log: 'audit log' }

const physicalTypeColumns = nameListColumns(ASSET_TYPES, 'Physical assets', 'assets')
const brandColumns = nameListColumns(ASSET_BRANDS, 'Physical assets', 'assets')

/** Click the pencil to change the score in place; Enter saves, Esc cancels. The table re-sorts itself, best first. */
function EditableScore({ id, name, score }: { id: number; name: string; score: number }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(score))
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const save = useWrite((value: number) => api.patch(`/condition-ratings/${id}`, { score: value }), { silent: true })
  const canEdit = useCan('assets', 'edit')

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
        {canEdit && (
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
        )}
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
        <IconButton
          label="Save score"
          size="sm"
          variant="secondary"
          onClick={() => void commit()}
          loading={save.isPending}
        >
          <Check className="size-4" />
        </IconButton>
        <IconButton label="Cancel score change" size="sm" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </IconButton>
      </div>
      {error && (
        <p role="alert" className="mt-1 whitespace-normal text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

/** What was typed, as a number. Anything that is not a whole number is sent as it is not, so the server's message explains the rule. */
const toScore = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

function AddRating() {
  const [name, setName] = useState('')
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useWrite((value: { name: string; score: number | null }) => api.post('/condition-ratings', value), {
    silent: true,
    success: 'Rating added',
  })
  if (!useCan('assets', 'edit')) return null
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
        <Input
          aria-label="New rating name"
          aria-invalid={error ? true : undefined}
          placeholder="New rating name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          aria-label="Score for the new rating, 1 to 100"
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          placeholder="Score"
          className="w-20 shrink-0"
          value={score}
          onChange={(event) => setScore(event.target.value)}
        />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={add.isPending}>
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </form>
  )
}

const r = columnsFor<ConditionRatingRow>()
const ratingColumns = [
  r.accessor('name', {
    header: 'Name',
    enableSorting: false,
    cell: (info) => (
      <EditableName
        kind={RATINGS}
        id={info.row.original.id}
        name={info.getValue()}
        tone={ratingTone(info.row.original.score)}
      />
    ),
  }),
  r.accessor('score', {
    header: 'Score',
    enableSorting: false,
    cell: (info) => <EditableScore id={info.row.original.id} name={info.row.original.name} score={info.getValue()} />,
  }),
  r.accessor('snapshotCount', {
    header: 'Records',
    enableSorting: false,
    cell: (info) => (
      <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue().toLocaleString()}</span>
    ),
    meta: { align: 'right', hideBelow: 'sm' },
  }),
  r.accessor('isActive', {
    header: 'Active',
    enableSorting: false,
    cell: (info) => (
      <ActiveSwitch
        kind={RATINGS}
        id={info.row.original.id}
        name={info.row.original.name}
        active={info.getValue()}
        onlyActive={isOnlyActive(info)}
      />
    ),
  }),
  r.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => (
      <DeleteButton
        kind={RATINGS}
        id={info.row.original.id}
        name={info.row.original.name}
        inUse={info.row.original.snapshotCount > 0}
        inUseReason={`${info.row.original.snapshotCount} condition records use this rating. Deactivate it instead.`}
        onlyActive={isOnlyActive(info)}
      />
    ),
    meta: { align: 'right', width: 'w-14', cellClassName: 'max-sm:pl-0' },
  }),
]

function AssetTypes() {
  const { data = [] } = useQuery(assetTypesQuery)
  return (
    <NameList
      kind={ASSET_TYPES}
      rows={data}
      columns={physicalTypeColumns}
      title="Physical asset types"
      plural="types"
      placeholder="New type name"
      noun="Type"
    />
  )
}

function AssetBrands() {
  const { data = [] } = useQuery(assetBrandsQuery)
  return (
    <NameList
      kind={ASSET_BRANDS}
      rows={data}
      columns={brandColumns}
      title="Physical asset brands"
      plural="brands"
      placeholder="New brand name"
      noun="Brand"
    />
  )
}

function ConditionRatings() {
  const { data: ratings = [] } = useQuery(ratingsQuery)
  const ratingTable = useGrid({
    data: ratings,
    columns: ratingColumns,
    getRowId: (row) => String(row.id),
    pageSize: 100,
  })
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Condition ratings"
        description="Best first. This order is the scale shown when issuing and returning."
      />
      <div className="flex flex-col gap-1.5 px-5 pb-4 text-sm leading-5 text-ink-2">
        <p>
          Each rating has a score from {RATING_SCORE_MIN} to {RATING_SCORE_MAX}: {RATING_SCORE_MAX} is as good as new,{' '}
          {RATING_SCORE_MIN} is beyond use. The score is what the rating means, whatever it is called. It sets the order
          of the scale and the colour of the badge, and no two ratings can share one.
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li>
            <Badge tone="accent">90 to 100</Badge>
          </li>
          <li>
            <Badge tone="ok">70 to 89</Badge>
          </li>
          <li>
            <Badge tone="warn">{RATING_ATTENTION_BELOW} to 69</Badge>
          </li>
          <li>
            <Badge tone="bad">Below {RATING_ATTENTION_BELOW}</Badge>
          </li>
        </ul>
        <p>
          Assets rated below {RATING_ATTENTION_BELOW} are listed under Condition watch on the overview. The rating
          closest to {RATING_DEFAULT_SCORE} is the one forms start on. Scores are shown only on this page.
        </p>
      </div>
      <AddRating />
      <DataGrid
        table={ratingTable}
        label="Condition ratings"
        noun="ratings"
        empty={null}
        className="rounded-none border-0 border-t shadow-none"
      />
    </Panel>
  )
}

export const assetTypesEditor: ListEditor = {
  key: 'asset-types',
  component: AssetTypes,
  load: (queryClient) => queryClient.ensureQueryData(assetTypesQuery),
}
export const assetBrandsEditor: ListEditor = {
  key: 'asset-brands',
  component: AssetBrands,
  load: (queryClient) => queryClient.ensureQueryData(assetBrandsQuery),
}
export const conditionRatingsEditor: ListEditor = {
  key: 'condition-ratings',
  column: 'side',
  component: ConditionRatings,
  load: (queryClient) => queryClient.ensureQueryData(ratingsQuery),
}
