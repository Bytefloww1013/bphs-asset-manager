import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Trash2, Wrench } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  MAINTENANCE_NOTE_MAX,
  MAINTENANCE_STATUSES,
  maintenanceStatusLabel,
  type MaintenanceStatus,
} from '@shared/constants.ts'
import { formatUsDate } from '@shared/dates.ts'
import type { EmployeeRow, MaintenanceDetail } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Field, Select, Textarea } from '@/components/ui/form.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { useMaintenancePageTitle } from '@/features/maintenance/page-title.ts'
import { MaintenanceStatusBadge, UrgentBadge } from '@/features/maintenance/status.tsx'
import { ApiError, api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { employeesQuery, maintenanceRequestQuery } from '@/lib/queries.ts'
import { useDenied } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/maintenance/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(maintenanceRequestQuery(Number(params.id))),
      context.queryClient.ensureQueryData(employeesQuery),
    ]),
  errorComponent: ({ error }) => (
    <EmptyState
      icon={Wrench}
      title={
        error instanceof ApiError && (error.status === 404 || error.status === 422)
          ? 'No request with that ID'
          : 'Could not load this request'
      }
      description={error instanceof Error ? error.message : undefined}
      action={
        <Link to="/maintenance" className={buttonStyles('primary')}>
          Back to requests
        </Link>
      }
    />
  ),
  component: RequestPage,
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink [overflow-wrap:anywhere]">
        {children || <span className="font-normal text-ink-3">—</span>}
      </dd>
    </div>
  )
}

const employeeKey = (person: EmployeeRow) => person.id
const employeeLabel = (person: EmployeeRow) => person.name
const employeeSearch = (person: EmployeeRow) => `${person.code} ${person.department ?? ''}`

function RequestPage() {
  const id = Number(Route.useParams().id)
  const navigate = useNavigate()
  const { data: request } = useQuery(maintenanceRequestQuery(id))
  const { data: employees = [] } = useQuery(employeesQuery)
  const [note, setNote] = useState('')
  const [deleting, setDeleting] = useState(false)
  useMaintenancePageTitle(request?.code)
  const noEdit = useDenied('maintenance', 'edit')
  const noFull = useDenied('maintenance', 'full')

  const dispatch = useWrite(
    (employeeId: number | null) => api.post<MaintenanceDetail>(`/maintenance/${id}/dispatch`, { employeeId }),
    {
      success: (now) => (now.assignee ? `Dispatched to ${now.assignee.name}` : 'Dispatch cleared'),
    },
  )
  const status = useWrite(
    (next: MaintenanceStatus) => api.post<MaintenanceDetail>(`/maintenance/${id}/status`, { status: next }),
    {
      success: (now) => `Status: ${maintenanceStatusLabel(now.status)}`,
    },
  )
  const addNote = useWrite((body: string) => api.post<MaintenanceDetail>(`/maintenance/${id}/notes`, { body }), {
    success: 'Note added',
    onSuccess: () => setNote(''),
  })
  const remove = useWrite(() => api.delete(`/maintenance/${id}`), {
    success: `${request?.code} deleted`,
    onSuccess: () => navigate({ to: '/maintenance' }),
  })
  if (!request) return null

  // An employee who has since been archived stays shown as the one dispatched, but only active employees can be chosen.
  const assignee = request.assignee ? (employees.find((person) => person.id === request.assignee!.id) ?? null) : null
  const choices = employees.filter((person) => person.state === 'active' || person.id === assignee?.id)
  const noteTooLong = note.trim().length > MAINTENANCE_NOTE_MAX

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link
          to="/maintenance"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> Requests
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Mono className="text-sm font-medium text-ink-2">{request.code}</Mono>
          <MaintenanceStatusBadge status={request.status} />
          <UrgentBadge urgent={request.urgent} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">
            {request.location}
          </h1>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" aria-hidden />}
            disabledReason={noFull}
            onClick={() => setDeleting(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Requested by">{request.requestedBy}</Fact>
          <Fact label="Email">
            {request.email && (
              <a href={`mailto:${request.email}`} className="text-accent hover:underline">
                {request.email}
              </a>
            )}
          </Fact>
          <Fact label="Program">{request.program}</Fact>
          <Fact label="Location">{request.location}</Fact>
        </dl>
        <dl className="grid divide-line border-t border-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Date">{formatUsDate(request.requestDate)}</Fact>
          <Fact label="Noticed">{formatUsDate(request.noticedDate)}</Fact>
          <Fact label="Submitted in Zoho">{formatUsDate(request.zohoAddedTime)}</Fact>
          <Fact label="Received">{formatDateTime(request.receivedAt)}</Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Description" className="border-b border-line" />
        <p className="max-w-[75ch] whitespace-pre-wrap px-5 py-5 text-sm leading-6 text-ink-2 [overflow-wrap:anywhere]">
          {request.description}
        </p>
      </Panel>

      <Panel className="grid gap-5 p-5 sm:grid-cols-2">
        <Field label="Dispatched to" hint={noEdit ?? 'Choosing someone makes a Not Started request Dispatched.'}>
          <Combobox
            items={choices}
            value={assignee}
            onChange={(person) => dispatch.mutate(person?.id ?? null)}
            getKey={employeeKey}
            getLabel={employeeLabel}
            getSearch={employeeSearch}
            placeholder="Nobody yet"
            emptyText="No active employee matches"
            disabled={!!noEdit || dispatch.isPending}
          />
        </Field>
        <Field label="Status" hint={request.assignee ? undefined : 'Dispatched needs someone chosen first.'}>
          <Select
            value={request.status}
            disabled={!!noEdit || status.isPending}
            onChange={(event) => status.mutate(event.target.value as MaintenanceStatus)}
          >
            {MAINTENANCE_STATUSES.map((value) => (
              <option
                key={value}
                value={value}
                disabled={value === 'dispatched' && !request.assignee && request.status !== value}
              >
                {maintenanceStatusLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
      </Panel>

      <Panel>
        <PanelHeader
          title="Timeline"
          description="What happened to this request, oldest first."
          className="border-b border-line"
        />
        <ol className="flex flex-col divide-y divide-line">
          {request.notes.map((line) => (
            <li key={line.id} className="flex flex-col gap-1 px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                {line.kind === 'system' && (
                  <Badge tone="neutral" dot={false}>
                    Automatic
                  </Badge>
                )}
                <span className="font-medium text-ink-2">{line.createdBy}</span>
                <span>{formatDateTime(line.createdAt)}</span>
              </div>
              <p
                className={
                  line.kind === 'system'
                    ? 'text-sm text-ink-2'
                    : 'whitespace-pre-wrap text-sm leading-6 text-ink [overflow-wrap:anywhere]'
                }
              >
                {line.body}
              </p>
            </li>
          ))}
        </ol>
        {!noEdit && (
          <form
            className="flex flex-col gap-3 border-t border-line p-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (note.trim() && !noteTooLong) addNote.mutate(note.trim())
            }}
          >
            <Field
              label="Add a note"
              hint={`${note.trim().length} of ${MAINTENANCE_NOTE_MAX} characters`}
              error={noteTooLong ? `A note can be at most ${MAINTENANCE_NOTE_MAX} characters.` : null}
            >
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div>
              <Button
                type="submit"
                loading={addNote.isPending}
                disabledReason={note.trim() ? undefined : 'Type a note first'}
              >
                Add note
              </Button>
            </div>
          </form>
        )}
      </Panel>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${request.code}?`}
        description="It and its timeline are removed for good. A request that will not be done is usually set to Rejected instead."
        confirmLabel="Delete request"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  )
}
