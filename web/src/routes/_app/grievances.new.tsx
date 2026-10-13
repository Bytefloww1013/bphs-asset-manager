import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { GRIEVANCE_SHORT_DESCRIPTION_MAX, GRIEVANCE_TITLE_MAX, grievanceCreateSchema, localToday } from '@shared/schemas.ts'
import type { EmployeeRow, GrievanceDetail } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Select, Textarea } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ownerAccountNote } from '@/features/grievances/manage.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { PeoplePicker } from '@/features/grievances/people-picker.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { employeesQuery, grievanceAccountHoldersQuery, grievanceCategoriesQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/grievances/new')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(employeesQuery),
      context.queryClient.ensureQueryData(grievanceCategoriesQuery),
      context.queryClient.ensureQueryData(grievanceAccountHoldersQuery),
    ]),
  component: NewGrievancePage,
})

const employeeKey = (person: EmployeeRow) => person.id
const employeeLabel = (person: EmployeeRow) => person.name
const employeeSearch = (person: EmployeeRow) => person.code

const count = (text: string, max: number) => `${text.trim().length} of ${max} characters`

// Nothing typed here is kept in browser storage: a grievance is sensitive and the machine may be shared.
function NewGrievancePage() {
  useGrievancePageTitle('New grievance')
  const navigate = useNavigate()
  const toast = useToast()
  const { data: employees = [] } = useQuery(employeesQuery)
  const { data: categories = [] } = useQuery(grievanceCategoriesQuery)
  const offered = categories.filter((category) => category.isActive)
  const active = employees.filter((person) => person.state === 'active')

  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [dateMade, setDateMade] = useState(localToday)
  const [categoryId, setCategoryId] = useState('')
  const [owner, setOwner] = useState<EmployeeRow | null>(null)
  const [involved, setInvolved] = useState<EmployeeRow[]>([])
  const [management, setManagement] = useState<EmployeeRow[]>([])
  const [body, setBody] = useState('')
  const [problem, setProblem] = useState<{ message: string; fields: Record<string, string> } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // Once it is saved there is nothing left to lose, and the page it leaves for must not be asked about.
  const saved = useRef(false)

  const save = useWrite((input: unknown) => api.post<GrievanceDetail>('/grievances', input), { silent: true })
  const dirty = Boolean(title.trim() || shortDescription.trim() || body || owner || involved.length || management.length)
  const leaving = useBlocker({ shouldBlockFn: () => dirty && !saved.current, enableBeforeUnload: () => dirty && !saved.current, withResolver: true })

  function refuse(next: { message: string; fields: Record<string, string> }) {
    setProblem(next)
    // The alert is at the top of a long form; the first field at fault is brought into view and given focus.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const parsed = grievanceCreateSchema.safeParse({
      title,
      shortDescription,
      body,
      dateMade,
      ownerId: owner?.id,
      categoryId: categoryId ? Number(categoryId) : undefined,
      employeeIds: involved.map((person) => person.id),
      managementIds: management.map((person) => person.id),
    })
    if (!parsed.success) return refuse({ message: 'Some of this is missing or needs changing. Nothing has been saved.', fields: fieldMessages(parsed.error) })
    try {
      const row = await save.mutateAsync(parsed.data)
      saved.current = true
      toast({ title: `${row.code} recorded`, description: row.title })
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
  const { data: accountHolders } = useQuery(grievanceAccountHoldersQuery)
  const ownerNamed = owner && [...involved, ...management].some((person) => person.id === owner.id)

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="New grievance" description="Record a grievance as it was made. What was done about it is added afterwards, as actions and events." />
      <Panel className="p-5 sm:p-6">
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void commit()
          }}
        >
          <dl className="flex items-baseline gap-3 text-sm">
            <dt className="font-medium text-ink">Grievance ID</dt>
            <dd className="text-ink-3">
              <Mono>GR-{new Date().getFullYear()}-····</Mono> Assigned when saved
            </dd>
          </dl>

          {problem && (
            <Alert tone="bad" title="Not saved">
              {problem.message}
            </Alert>
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
          <Field
            label="Owner"
            hint={[ownerAccountNote(owner, accountHolders), ownerNamed ? `${owner.name} is also named on this grievance.` : null].filter(Boolean).join(' ') || 'Who is responsible for seeing it through. Only the owner and Super Admins can change a grievance later.'}
            error={error('ownerId')}
          >
            <Combobox items={active} value={owner} onChange={edit('ownerId', setOwner)} getKey={employeeKey} getLabel={employeeLabel} getSearch={employeeSearch} placeholder="Search by name or Employee ID" emptyText="No active employee matches" />
          </Field>

          <Field label="Grievance" error={error('body')}>
            <RichTextEditor label="Grievance" onChange={edit('body', setBody)} />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Link to="/grievances" className={buttonStyles('secondary')}>
              Cancel
            </Link>
            <Button variant="primary" type="submit" loading={save.isPending}>
              Save grievance
            </Button>
          </div>
        </form>
      </Panel>

      <ConfirmDialog
        open={leaving.status === 'blocked'}
        onOpenChange={(open) => !open && leaving.reset?.()}
        title="Leave without saving?"
        description="This grievance has not been saved. If you leave now, what you have written is lost."
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => leaving.proceed?.()}
      />
    </div>
  )
}
