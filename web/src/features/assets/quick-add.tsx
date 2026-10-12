import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { defaultRating } from '@shared/constants.ts'
import { nextTag } from '@shared/tags.ts'
import type { AssetBulkResult, AssetRow, EmployeeRef } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Select } from '@/components/ui/form.tsx'
import { Kbd, Panel } from '@/components/ui/layout.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api, ApiError } from '@/lib/api.ts'
import { plural } from '@/lib/format.ts'
import { assetsQuery, lookupsQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

/** Rows pasted from a spreadsheet: tag, type, serial, condition, holder. A header row is skipped. */
function parsePaste(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
  if (rows[0] && /^(asset\s*)?tag$/i.test(rows[0][0] ?? '')) rows.shift()
  return rows.map(([tag = '', type = '', serial = '', condition = '', holder = '']) => ({ tag, type, serial, condition, holder }))
}

/** What the server (or this form) refused: a sentence for the alert, and a message per field. */
interface Problem {
  message: string
  fields: Record<string, string>
}

// The fields of this form that show their own message; anything else the server says goes in the alert.
const SHOWN_UNDER_FIELDS = ['tag', 'typeId', 'serial', 'conditionRatingId']

export function QuickAddAsset({ onAdded }: { onAdded: (id: number) => void }) {
  const user = useUser()
  const toast = useToast()
  const { data: lookups } = useQuery(lookupsQuery)
  const { data: assets = [] } = useQuery(assetsQuery)
  const types = lookups?.assetTypes ?? []
  const ratings = lookups?.conditionRatings ?? []
  const people = lookups?.employees ?? []

  const tagRef = useRef<HTMLInputElement>(null)
  const [tag, setTag] = useState('')
  const [typeId, setTypeId] = useState('')
  const [serial, setSerial] = useState('')
  const [ratingId, setRatingId] = useState('')
  const [holder, setHolder] = useState<EmployeeRef | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [skipped, setSkipped] = useState<AssetBulkResult['errors']>([])

  const suggestion = useMemo(() => nextTag(assets), [assets])
  const effectiveType = typeId || String(types[0]?.id ?? '')
  const goodId = defaultRating(ratings)?.id
  const effectiveRating = ratingId || String(goodId ?? '')

  const elsewhere = Object.entries(problem?.fields ?? {}).filter(([name]) => !SHOWN_UNDER_FIELDS.includes(name))
  const alert = problem && (Object.keys(problem.fields).length === 0 ? problem.message : elsewhere.map(([, message]) => message).join(' '))

  const add = useWrite((body: Record<string, unknown>) => api.post<AssetRow>('/assets', body), { silent: true })
  const bulk = useWrite((rows: ReturnType<typeof parsePaste>) => api.post<AssetBulkResult>('/assets/bulk', { rows }), { silent: true })

  function refuse(e: unknown, fallback: string) {
    const refused = e instanceof ApiError ? { message: e.message, fields: e.fields } : { message: fallback, fields: {} }
    setProblem(refused)
    if (refused.fields.tag) tagRef.current?.focus()
  }

  async function commit() {
    setProblem(null)
    setSkipped([])
    if (!tag.trim()) {
      setProblem({ message: 'Enter an asset tag.', fields: { tag: 'Enter an asset tag.' } })
      tagRef.current?.focus()
      return
    }
    try {
      const row = await add.mutateAsync({
        tag,
        typeId: Number(effectiveType),
        serial,
        conditionRatingId: Number(effectiveRating),
        holderId: holder?.id ?? null,
        assessedById: user.employeeId,
      })
      toast({ title: `${row.tag} added`, description: row.holder ? `Issued to ${row.holder.name}` : 'In storage' })
      onAdded(row.id)
      setTag('')
      setSerial('')
      setHolder(null)
      tagRef.current?.focus()
    } catch (e) {
      refuse(e, 'Could not add the asset.')
    }
  }

  async function paste(text: string) {
    setProblem(null)
    const rows = parsePaste(text)
    if (rows.length === 0) return
    try {
      const result = await bulk.mutateAsync(rows)
      setSkipped(result.errors)
      toast({ tone: result.created ? 'ok' : 'warn', title: result.created ? `Added ${plural(result.created, 'asset')}` : 'Nothing was added', description: result.errors.length ? `${plural(result.errors.length, 'row')} skipped` : undefined })
    } catch (e) {
      refuse(e, 'Could not add those rows.')
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Quick add</h2>
        <p className="text-sm text-ink-3">
          Enter adds the asset. Paste rows from a spreadsheet into Asset tag to add many (tag, type, serial, condition, holder).
        </p>
      </div>
      <form
        className="mt-4 grid items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-12"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void commit()
        }}
      >
        <Field label="Asset tag" error={problem?.fields.tag} className="lg:col-span-2">
          <Input
            ref={tagRef}
            mono
            value={tag}
            placeholder={suggestion}
            autoComplete="off"
            onChange={(event) => setTag(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData('text')
              if (/[\t\n]/.test(text.trim())) {
                event.preventDefault()
                void paste(text)
              }
            }}
          />
        </Field>
        <Field label="Type" error={problem?.fields.typeId} className="lg:col-span-2">
          <Select value={effectiveType} onChange={(event) => setTypeId(event.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Serial number" optional error={problem?.fields.serial} className="lg:col-span-2">
          <Input mono value={serial} onChange={(event) => setSerial(event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Condition" error={problem?.fields.conditionRatingId} className="lg:col-span-2">
          <Select value={effectiveRating} onChange={(event) => setRatingId(event.target.value)}>
            {ratings.map((rating) => (
              <option key={rating.id} value={rating.id}>
                {rating.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issue to" optional className="sm:col-span-2 lg:col-span-3">
          <Combobox
            items={people}
            value={holder}
            onChange={setHolder}
            getKey={(person) => person.id}
            getLabel={(person) => person.name}
            getSearch={(person) => `${person.code} ${person.department ?? ''}`}
            placeholder="Leave blank to keep it in storage"
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="primary" className="w-full" loading={add.isPending || bulk.isPending}>
            Add <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />
          </Button>
        </div>
      </form>
      {alert && (
        <Alert tone="bad" className="mt-4">
          {alert}
        </Alert>
      )}
      {skipped.length > 0 && (
        <Alert tone="warn" className="mt-4" title={`${plural(skipped.length, 'pasted row')} skipped`}>
          <ul className="mt-1 list-disc pl-4">
            {skipped.slice(0, 6).map((row) => (
              <li key={row.row}>
                Row {row.row}: {row.message}
              </li>
            ))}
            {skipped.length > 6 && <li>and {skipped.length - 6} more</li>}
          </ul>
        </Alert>
      )}
      <p className="sr-only">
        Press <Kbd>Enter</Kbd> to add.
      </p>
    </Panel>
  )
}
