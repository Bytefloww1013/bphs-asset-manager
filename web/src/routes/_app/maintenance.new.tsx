import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'
import { localToday, maintenanceCreateSchema } from '@shared/schemas.ts'
import type { MaintenanceDetail } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { DateInput, Field, Input, Select, Textarea } from '@/components/ui/form.tsx'
import { PageHeader, Panel } from '@/components/ui/layout.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { useMaintenancePageTitle } from '@/features/maintenance/page-title.ts'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { maintenanceQuery } from '@/lib/queries.ts'
import { useDenied } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/maintenance/new')({ component: NewRequestPage })

interface Problem {
  message: string
  fields: Record<string, string>
}

const blank = {
  firstName: '',
  lastName: '',
  email: '',
  program: '',
  location: '',
  description: '',
  urgent: 'No',
  noticedDate: '',
}

/** For a request that came another way, by phone or in person, or one Zoho never delivered. */
function NewRequestPage() {
  useMaintenancePageTitle('New request')
  const readOnly = useDenied('maintenance', 'edit')
  const navigate = useNavigate()
  const toast = useToast()
  const programsId = useId()
  // The programs requests already name, offered as suggestions; any text is still taken, as Zoho takes it.
  const { data: requests = [] } = useQuery(maintenanceQuery)
  const programs = [...new Set(requests.map((row) => row.program).filter(Boolean))].sort()
  const [values, setValues] = useState(blank)
  const [problem, setProblem] = useState<Problem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const save = useWrite((input: unknown) => api.post<MaintenanceDetail>('/maintenance', input), { silent: true })

  const set = (name: keyof typeof blank) => (event: { target: { value: string } }) => {
    setValues((now) => ({ ...now, [name]: event.target.value }))
    setProblem((now) =>
      now && name in now.fields
        ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== name)) }
        : now,
    )
  }
  const error = (name: string) => problem?.fields[name] ?? null

  function refuse(next: Problem) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const parsed = maintenanceCreateSchema.safeParse({ ...values, noticedDate: values.noticedDate || undefined })
    if (!parsed.success)
      return refuse({
        message: 'Some of this is missing or needs changing. Nothing has been saved.',
        fields: fieldMessages(parsed.error),
      })
    try {
      const request = await save.mutateAsync(parsed.data)
      toast({ title: `${request.code} entered`, description: request.location })
      await navigate({ to: '/maintenance/$id', params: { id: String(request.id) } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New request"
        description="Enter a request that did not come through the Zoho form. It starts as Not Started."
      />
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
          {problem && (
            <Alert tone="bad" title="Not saved">
              {problem.message}
            </Alert>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" error={error('firstName')}>
              <Input value={values.firstName} onChange={set('firstName')} autoComplete="off" autoFocus />
            </Field>
            <Field label="Last name" optional error={error('lastName')}>
              <Input value={values.lastName} onChange={set('lastName')} autoComplete="off" />
            </Field>
            <Field label="Email" optional error={error('email')}>
              <Input type="email" value={values.email} onChange={set('email')} autoComplete="off" />
            </Field>
            <Field label="Program" optional error={error('program')}>
              <Input value={values.program} onChange={set('program')} list={programsId} autoComplete="off" />
            </Field>
          </div>
          <datalist id={programsId}>
            {programs.map((program) => (
              <option key={program} value={program} />
            ))}
          </datalist>
          <Field label="Location" hint="The building and room, or where on the site." error={error('location')}>
            <Input value={values.location} onChange={set('location')} autoComplete="off" />
          </Field>
          <Field label="Description" hint="What needs doing." error={error('description')}>
            <Textarea rows={5} value={values.description} onChange={set('description')} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Urgent" error={error('urgent')}>
              <Select value={values.urgent} onChange={set('urgent')}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </Select>
            </Field>
            <Field label="Date noticed" optional hint="Today or earlier." error={error('noticedDate')}>
              <DateInput max={localToday()} value={values.noticedDate} onChange={set('noticedDate')} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={save.isPending} disabledReason={readOnly}>
              Save request
            </Button>
            <Link to="/maintenance" className={buttonStyles('ghost')}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  )
}
