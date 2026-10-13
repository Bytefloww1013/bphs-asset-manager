import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { GRIEVANCE_NOTE_MAX, GRIEVANCE_SHORT_DESCRIPTION_MAX, GRIEVANCE_TITLE_MAX, grievanceCreateSchema, grievanceUpdateSchema, localToday } from '@shared/schemas.ts'
import type { EmployeeRow, GrievanceDetail, GrievancePerson } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Select, Textarea } from '@/components/ui/form.tsx'
import { Mono, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ownerAccountNote } from '@/features/grievances/manage.tsx'
import { PeoplePicker } from '@/features/grievances/people-picker.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { employeesQuery, grievanceAccountHoldersQuery, grievanceCategoriesQuery, refreshData } from '@/lib/queries.ts'

const employeeKey = (person: EmployeeRow) => person.id
const employeeLabel = (person: EmployeeRow) => person.name
const employeeSearch = (person: EmployeeRow) => person.code

const count = (text: string, max: number) => `${text.trim().length} of ${max} characters`
const sameIds = (a: { id: number }[], b: { id: number }[]) => a.length === b.length && a.every((one) => b.some((other) => other.id === one.id))

interface Problem {
  message: string
  fields: Record<string, string>
  code?: string
}

/**
 * The form a grievance is recorded with, and the same form for editing one. Given a grievance it starts from what that grievance
 * says, asks why it is being changed, and leaves the owner alone: the owner is changed from the grievance's page.
 *
 * Nothing typed here is kept in browser storage: a grievance is sensitive and the machine may be shared.
 */
export function GrievanceForm({ grievance, onReload }: { grievance?: GrievanceDetail; onReload?: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: employees = [] } = useQuery(employeesQuery)
  const { data: categories = [] } = useQuery(grievanceCategoriesQuery)
  const { data: accountHolders } = useQuery(grievanceAccountHoldersQuery)
  // What the form started from. It is read once: a grievance that changes underneath is for the save to refuse, not for the form to follow.
  const [was] = useState(grievance)
  const named = (people: GrievancePerson[] = []) => people.flatMap((person) => employees.find((row) => row.id === person.id) ?? [])
  // A category no longer in use is still offered to the grievance that has it.
  const offered = categories.filter((category) => category.isActive || category.id === was?.category.id)
  const active = employees.filter((person) => person.state === 'active')

  const [title, setTitle] = useState(was?.title ?? '')
  const [shortDescription, setShortDescription] = useState(was?.shortDescription ?? '')
  const [dateMade, setDateMade] = useState(was?.dateMade ?? localToday)
  const [categoryId, setCategoryId] = useState(was ? String(was.category.id) : '')
  const [owner, setOwner] = useState<EmployeeRow | null>(null)
  const [involved, setInvolved] = useState<EmployeeRow[]>(() => named(was?.employees))
  const [management, setManagement] = useState<EmployeeRow[]>(() => named(was?.management))
  const [body, setBody] = useState(was?.bodyHtml ?? '')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // Once it is saved there is nothing left to lose, and the page it leaves for must not be asked about.
  const saved = useRef(false)

  const save = useWrite((input: unknown) => (was ? api.patch<GrievanceDetail>(`/grievances/${encodeURIComponent(was.code)}`, input) : api.post<GrievanceDetail>('/grievances', input)), { silent: true })
  const dirty = was
    ? title !== was.title || shortDescription !== was.shortDescription || dateMade !== was.dateMade || categoryId !== String(was.category.id) || body !== was.bodyHtml || !sameIds(involved, was.employees) || !sameIds(management, was.management) || Boolean(reason.trim())
    : Boolean(title.trim() || shortDescription.trim() || body || owner || involved.length || management.length)
  const leaving = useBlocker({ shouldBlockFn: () => dirty && !saved.current, enableBeforeUnload: () => dirty && !saved.current, withResolver: true })
  // Someone else's edit was saved first. What is typed here stays on the page to be copied, but it can no longer be saved over theirs.
  const stale = problem?.code === 'stale_version'

  function refuse(next: Problem) {
    setProblem(next)
    // The alert is at the top of a long form; the first field at fault is brought into view and given focus.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const fields = {
      title,
      shortDescription,
      body,
      dateMade,
      categoryId: categoryId ? Number(categoryId) : undefined,
      employeeIds: involved.map((person) => person.id),
      managementIds: management.map((person) => person.id),
    }
    const parsed = was ? grievanceUpdateSchema.safeParse({ ...fields, version: was.version, reason }) : grievanceCreateSchema.safeParse({ ...fields, ownerId: owner?.id })
    if (!parsed.success) return refuse({ message: 'Some of this is missing or needs changing. Nothing has been saved.', fields: fieldMessages(parsed.error) })
    try {
      const row = await save.mutateAsync(parsed.data)
      saved.current = true
      toast({ title: was ? `${row.code} edited` : `${row.code} recorded`, description: row.title })
      await navigate({ to: '/grievances/$code', params: { code: row.code } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  const error = (name: string) => problem?.fields[name] ?? null
  // A field's message goes as soon as the field is changed; whether the change is enough is for the next save to say.
  const edit =
    <T,>(name: string, set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setProblem((now) => (now && name in now.fields ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) } : now))
    }
  const ownerNamed = owner && [...involved, ...management].some((person) => person.id === owner.id)

  return (
    <>
      <Panel className="p-5 sm:p-6">
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!stale) void commit()
          }}
        >
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm">
            <dt className="font-medium text-ink">Grievance ID</dt>
            <dd className="text-ink-3">
              {was ? (
                <Mono className="text-ink-2">{was.code}</Mono>
              ) : (
                <>
                  <Mono>GR-{new Date().getFullYear()}-····</Mono> Assigned when saved
                </>
              )}
            </dd>
            {was && (
              <>
                <dt className="font-medium text-ink">Owner</dt>
                <dd className="text-ink-3">
                  <span className="text-ink-2">{was.owner.name}</span> · changed from the grievance's page, not here
                </dd>
              </>
            )}
          </dl>

          {stale ? (
            <Alert
              tone="bad"
              title="Someone else edited this grievance first"
              action={<Button onClick={() => void refreshData(queryClient).then(onReload)}>Discard my changes and reload</Button>}
            >
              {problem.message} What you have typed is still below, so you can copy what you need. Then reload the grievance as it now stands and make your change again.
            </Alert>
          ) : (
            problem && (
              <Alert tone="bad" title="Not saved">
                {problem.message}
              </Alert>
            )
          )}

          <Field label="Title" hint={count(title, GRIEVANCE_TITLE_MAX)} error={error('title')}>
            <Input value={title} onChange={(event) => edit('title', setTitle)(event.target.value)} autoComplete="off" autoFocus />
          </Field>
          <Field label="Short description" hint={`One or two sentences, shown in the list. ${count(shortDescription, GRIEVANCE_SHORT_DESCRIPTION_MAX)}`} error={error('shortDescription')}>
            <Textarea rows={2} className="min-h-0" value={shortDescription} onChange={(event) => edit('shortDescription', setShortDescription)(event.target.value)} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date made" hint="The day the grievance was raised. Today or earlier." error={error('dateMade')}>
              <Input type="date" max={localToday()} value={dateMade} onChange={(event) => edit('dateMade', setDateMade)(event.target.value)} />
            </Field>
            <Field label="Category" error={error('categoryId')}>
              <Select value={categoryId} onChange={(event) => edit('categoryId', setCategoryId)(event.target.value)}>
                <option value="">Choose a category</option>
                {offered.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.isActive ? '' : ' (no longer in use)'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Employees involved" hint="Who the grievance is from or about." error={error('employeeIds')}>
            <PeoplePicker employees={employees} value={involved} onChange={edit('employeeIds', setInvolved)} exclude={management} />
          </Field>
          <Field label="Management involved" hint="Nobody can be in both lists." error={error('managementIds')}>
            <PeoplePicker employees={employees} value={management} onChange={edit('managementIds', setManagement)} exclude={involved} />
          </Field>
          {!was && (
            <Field
              label="Owner"
              hint={[ownerAccountNote(owner, accountHolders), ownerNamed ? `${owner.name} is also named on this grievance.` : null].filter(Boolean).join(' ') || 'Who is responsible for seeing it through. Only the owner and Super Admins can change a grievance later.'}
              error={error('ownerId')}
            >
              <Combobox items={active} value={owner} onChange={edit('ownerId', setOwner)} getKey={employeeKey} getLabel={employeeLabel} getSearch={employeeSearch} placeholder="Search by name or Employee ID" emptyText="No active employee matches" />
            </Field>
          )}

          <Field label="Grievance" error={error('body')}>
            <RichTextEditor label="Grievance" defaultValue={was?.bodyHtml} onChange={edit('body', setBody)} />
          </Field>

          {was && (
            <Field label="Reason for change" hint={`Shown on the timeline, beside the fields that changed. What it said before is kept as a version. ${count(reason, GRIEVANCE_NOTE_MAX)}`} error={error('reason')}>
              <Textarea rows={2} className="min-h-0" value={reason} onChange={(event) => edit('reason', setReason)(event.target.value)} />
            </Field>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            {was ? (
              <Link to="/grievances/$code" params={{ code: was.code }} className={buttonStyles('secondary')}>
                Cancel
              </Link>
            ) : (
              <Link to="/grievances" className={buttonStyles('secondary')}>
                Cancel
              </Link>
            )}
            <Button variant="primary" type="submit" loading={save.isPending} disabledReason={stale ? 'This grievance was edited by someone else. Reload it first.' : was && !dirty ? 'Nothing has been changed yet.' : undefined}>
              {was ? 'Save changes' : 'Save grievance'}
            </Button>
          </div>
        </form>
      </Panel>

      <ConfirmDialog
        open={leaving.status === 'blocked'}
        onOpenChange={(open) => !open && leaving.reset?.()}
        title="Leave without saving?"
        description={was ? 'Your changes have not been saved. If you leave now, they are lost.' : 'This grievance has not been saved. If you leave now, what you have written is lost.'}
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => leaving.proceed?.()}
      />
    </>
  )
}
