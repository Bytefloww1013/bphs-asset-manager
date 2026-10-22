import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultRating } from '@shared/constants.ts'
import { entraObjectId } from '@shared/schemas.ts'
import { nextTag } from '@shared/tags.ts'
import type { AssetBulkResult, AssetRow, EmployeeRef, ProgramRef } from '@shared/types.ts'
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

/** Rows pasted from a spreadsheet: tag, type, brand, model, Entra ObjectId, serial, condition, holder. A header row is skipped. */
function parsePaste(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
  if (rows[0] && /^(asset\s*)?tag$/i.test(rows[0][0] ?? '')) rows.shift()
  return rows.map(
    ([tag = '', type = '', brand = '', model = '', entraObjectId = '', serial = '', condition = '', holder = '']) => ({
      tag,
      type,
      brand,
      model,
      entraObjectId,
      serial,
      condition,
      holder,
    }),
  )
}

/** What the server (or this form) refused: a sentence for the alert, and a message per field. */
interface Problem {
  message: string
  fields: Record<string, string>
}

// The fields of this form that show their own message; anything else the server says goes in the alert.
const SHOWN_UNDER_FIELDS = ['tag', 'typeId', 'brandId', 'model', 'entraObjectId', 'serial', 'conditionRatingId']

export function QuickAddAsset({ onAdded }: { onAdded: (id: number) => void }) {
  const user = useUser()
  const toast = useToast()
  const { data: lookups } = useQuery(lookupsQuery)
  const { data: assets = [] } = useQuery(assetsQuery)
  const types = lookups?.assetTypes ?? []
  const brands = lookups?.assetBrands ?? []
  const ratings = lookups?.conditionRatings ?? []
  const people = lookups?.employees ?? []
  const programs = lookups?.programs ?? []

  const tagRef = useRef<HTMLInputElement>(null)
  const [tag, setTag] = useState('')
  const [typeId, setTypeId] = useState('')
  // Brand has no default: a wrong one would pass unnoticed. Like Type and Model, it is kept for the next asset.
  const [brandId, setBrandId] = useState('')
  const [model, setModel] = useState('')
  const [entra, setEntra] = useState('')
  const [serial, setSerial] = useState('')
  const [ratingId, setRatingId] = useState('')
  const [to, setTo] = useState<'employee' | 'program'>('employee')
  const [holder, setHolder] = useState<EmployeeRef | null>(null)
  const [program, setProgram] = useState<ProgramRef | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [skipped, setSkipped] = useState<AssetBulkResult['errors']>([])
  // Pasted rows wait here to be looked over. Nothing is written until they are confirmed: there is no undo for an asset.
  const [pasted, setPasted] = useState<ReturnType<typeof parsePaste> | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pasted) confirmRef.current?.focus()
  }, [pasted])

  const suggestion = useMemo(() => nextTag(assets), [assets])
  const effectiveType = typeId || String(types[0]?.id ?? '')
  const goodId = defaultRating(ratings)?.id
  const effectiveRating = ratingId || String(goodId ?? '')

  const elsewhere = Object.entries(problem?.fields ?? {}).filter(([name]) => !SHOWN_UNDER_FIELDS.includes(name))
  const alert =
    problem &&
    (Object.keys(problem.fields).length === 0 ? problem.message : elsewhere.map(([, message]) => message).join(' '))

  const add = useWrite((body: Record<string, unknown>) => api.post<AssetRow>('/assets', body), { silent: true })
  const bulk = useWrite((rows: ReturnType<typeof parsePaste>) => api.post<AssetBulkResult>('/assets/bulk', { rows }), {
    silent: true,
  })

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
    const fields: Record<string, string> = {}
    if (!brandId) fields.brandId = 'Choose a brand'
    const entraChecked = entraObjectId.safeParse(entra)
    if (!entraChecked.success) fields.entraObjectId = entraChecked.error.issues[0]?.message ?? 'Enter a GUID'
    if (Object.keys(fields).length > 0) {
      setProblem({ message: 'Check the highlighted fields.', fields })
      return
    }
    try {
      const row = await add.mutateAsync({
        tag,
        typeId: Number(effectiveType),
        brandId: Number(brandId),
        model,
        entraObjectId: entra,
        serial,
        conditionRatingId: Number(effectiveRating),
        holderId: to === 'employee' ? (holder?.id ?? null) : null,
        programId: to === 'program' ? (program?.id ?? null) : null,
        assessedById: user.employeeId,
      })
      toast({
        title: `${row.tag} added`,
        description: row.holder || row.program ? `Issued to ${(row.holder ?? row.program)?.name}` : 'In storage',
      })
      onAdded(row.id)
      setTag('')
      setEntra('')
      setSerial('')
      setHolder(null)
      setProgram(null)
      tagRef.current?.focus()
    } catch (e) {
      refuse(e, 'Could not add the asset.')
    }
  }

  function paste(text: string) {
    const rows = parsePaste(text)
    if (rows.length === 0) return
    setProblem(null)
    setSkipped([])
    setPasted(rows)
  }

  function discardPasted() {
    setPasted(null)
    tagRef.current?.focus()
  }

  async function addPasted(rows: ReturnType<typeof parsePaste>) {
    setProblem(null)
    try {
      const result = await bulk.mutateAsync(rows)
      setPasted(null)
      tagRef.current?.focus()
      setSkipped(result.errors)
      toast({
        tone: result.created ? 'ok' : 'warn',
        title: result.created ? `Added ${plural(result.created, 'asset')}` : 'Nothing was added',
        description: result.errors.length ? `${plural(result.errors.length, 'row')} skipped` : undefined,
      })
    } catch (e) {
      refuse(e, 'Could not add those rows.')
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Quick add</h2>
        <p className="text-sm text-ink-3">
          Enter adds the physical asset. Paste rows from a spreadsheet into Asset tag to add many (tag, type, brand,
          model, Entra ObjectId, serial, condition, holder); you see them before they are added.
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
        <Field label="Asset tag" error={problem?.fields.tag} className="lg:col-span-3">
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
                paste(text)
              }
            }}
          />
        </Field>
        <Field label="Type" error={problem?.fields.typeId} className="lg:col-span-3">
          <Select value={effectiveType} onChange={(event) => setTypeId(event.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand" error={problem?.fields.brandId} className="lg:col-span-3">
          <Select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
            <option value="" disabled>
              Choose a brand
            </option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model" optional error={problem?.fields.model} className="lg:col-span-3">
          <Input value={model} onChange={(event) => setModel(event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Entra ObjectId" optional error={problem?.fields.entraObjectId} className="lg:col-span-4">
          <Input
            mono
            value={entra}
            onChange={(event) => setEntra(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Serial number" optional error={problem?.fields.serial} className="lg:col-span-4">
          <Input mono value={serial} onChange={(event) => setSerial(event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Condition" error={problem?.fields.conditionRatingId} className="lg:col-span-4">
          <Select value={effectiveRating} onChange={(event) => setRatingId(event.target.value)}>
            {ratings.map((rating) => (
              <option key={rating.id} value={rating.id}>
                {rating.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issue to" className="lg:col-span-3">
          <Select value={to} onChange={(event) => setTo(event.target.value as typeof to)}>
            <option value="employee">Employee</option>
            <option value="program">Program</option>
          </Select>
        </Field>
        {to === 'program' ? (
          <Field label="Program" optional className="lg:col-span-7">
            <Combobox
              items={programs}
              value={program}
              onChange={setProgram}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getSearch={(item) => item.code}
              placeholder="Leave blank to keep it in storage"
              emptyText="No matching programs"
            />
          </Field>
        ) : (
          <Field label="Employee" optional className="lg:col-span-7">
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
        )}
        <div className="sm:col-span-2 lg:col-span-2">
          <Button type="submit" variant="primary" className="w-full" loading={add.isPending || bulk.isPending}>
            Add <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />
          </Button>
        </div>
      </form>
      {pasted && (
        <section aria-label="Pasted rows" className="mt-4 rounded-control border border-line bg-sunken p-4">
          <h3 className="text-sm font-semibold text-ink">Add {plural(pasted.length, 'pasted row')}?</h3>
          <p className="mt-1 text-sm text-ink-3">
            Nothing has been added yet. A blank condition means {defaultRating(ratings)?.name ?? 'the default'}; a blank
            holder means storage.
          </p>
          <div className="mt-3 max-h-56 overflow-auto rounded-control border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr>
                  {[
                    'Asset tag',
                    'Type',
                    'Brand',
                    'Model',
                    'Entra ObjectId',
                    'Serial number',
                    'Condition',
                    'Issue to',
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="sticky top-0 whitespace-nowrap bg-surface px-3 py-2 font-medium"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pasted.map((row, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[0.8125rem]">{row.tag}</td>
                    <td className="px-3 py-1.5">{row.type}</td>
                    <td className="px-3 py-1.5">{row.brand}</td>
                    <td className="px-3 py-1.5">{row.model}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[0.8125rem]">{row.entraObjectId}</td>
                    <td className="px-3 py-1.5 font-mono text-[0.8125rem]">{row.serial}</td>
                    <td className="px-3 py-1.5">{row.condition}</td>
                    <td className="px-3 py-1.5">{row.holder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={discardPasted} disabled={bulk.isPending}>
              Discard
            </Button>
            <Button ref={confirmRef} variant="primary" loading={bulk.isPending} onClick={() => void addPasted(pasted)}>
              Add {plural(pasted.length, 'asset')}
            </Button>
          </div>
        </section>
      )}
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
