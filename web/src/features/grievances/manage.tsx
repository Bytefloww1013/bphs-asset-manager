import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { grievanceStatusLabel } from '@shared/constants.ts'
import { SUPER_ADMIN_ONLY, canManageGrievance, grievanceManageReason } from '@shared/permissions.ts'
import { GRIEVANCE_NOTE_MAX, GRIEVANCE_OPEN_STATUSES } from '@shared/schemas.ts'
import type { EmployeeRow, GrievanceDetail } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Segmented, Textarea } from '@/components/ui/form.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ApiError, api } from '@/lib/api.ts'
import { employeesQuery, grievanceAccountHoldersQuery } from '@/lib/queries.ts'
import { useCan, useUser } from '@/lib/session.ts'

/** What to say under an Owner field when the person chosen has no account that works in Grievances: nobody but a Super Admin could then change the grievance. */
export function ownerAccountNote(owner: { id: number; name: string } | null, accountHolders: number[] | undefined): string | null {
  if (!owner || !accountHolders || accountHolders.includes(owner.id)) return null
  return `${owner.name} has no account with access to Grievances, so only a Super Admin will be able to change this grievance.`
}

type Task = 'status' | 'owner' | 'void'

/**
 * Edit, Change status, Change owner and Void, for a grievance's page. Someone who may not use one still sees it, with the reason;
 * the server refuses them whatever the page shows. A voided grievance offers none of them.
 */
export function GrievanceActions({ grievance }: { grievance: GrievanceDetail }) {
  const user = useUser()
  const navigate = useNavigate()
  const canVoid = useCan('grievance.void')
  const [task, setTask] = useState<Task | null>(null)
  if (grievance.status === 'voided') return null
  const notOwner = canManageGrievance(user, grievance.owner.id) ? undefined : grievanceManageReason(grievance.owner.name)
  const close = () => setTask(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabledReason={notOwner ?? (grievance.status === 'closed' ? 'Reopen it before editing it.' : undefined)} onClick={() => void navigate({ to: '/grievances/$code/edit', params: { code: grievance.code } })}>
        Edit
      </Button>
      <Button disabledReason={notOwner} onClick={() => setTask('status')}>
        Change status
      </Button>
      <Button disabledReason={notOwner ?? (grievance.status === 'closed' ? 'Reopen it before changing its owner.' : undefined)} onClick={() => setTask('owner')}>
        Change owner
      </Button>
      <Button variant="danger-ghost" disabledReason={canVoid ? undefined : SUPER_ADMIN_ONLY} onClick={() => setTask('void')}>
        Void
      </Button>
      {task === 'status' && <StatusSheet grievance={grievance} onClose={close} />}
      {task === 'owner' && <OwnerSheet grievance={grievance} onClose={close} />}
      {task === 'void' && <VoidSheet grievance={grievance} onClose={close} />}
    </div>
  )
}

/** One change to a grievance: the request, what went wrong with it, and the sheet around its form. */
function useChange(grievance: GrievanceDetail, action: Task, success: (next: GrievanceDetail) => string, onClose: () => void) {
  const [error, setError] = useState<ApiError | null>(null)
  const write = useWrite((body: Record<string, unknown>) => api.post<GrievanceDetail>(`/grievances/${grievance.code}/${action}`, body), { silent: true, success })
  async function send(body: Record<string, unknown>) {
    setError(null)
    try {
      await write.mutateAsync(body)
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }
  return { error, send, pending: write.isPending, field: (name: string) => error?.fields[name] }
}

function ChangeSheet({
  title,
  grievance,
  submit,
  danger,
  change,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  grievance: GrievanceDetail
  submit: string
  danger?: boolean
  change: ReturnType<typeof useChange>
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={`${grievance.code} · ${grievance.title}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form="grievance-change-form" loading={change.pending}>
            {submit}
          </Button>
        </>
      }
    >
      <form
        id="grievance-change-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSubmit()
        }}
      >
        {change.error && !Object.keys(change.error.fields).length && (
          <Alert tone="bad" title="That did not go through">
            {change.error.message}
          </Alert>
        )}
        {children}
      </form>
    </Sheet>
  )
}

const Note = ({ value, onChange, ...rest }: { value: string; onChange: (next: string) => void }) => (
  <Textarea {...rest} value={value} onChange={(event) => onChange(event.target.value)} maxLength={GRIEVANCE_NOTE_MAX} rows={4} />
)

function StatusSheet({ grievance, onClose }: { grievance: GrievanceDetail; onClose: () => void }) {
  const options = GRIEVANCE_OPEN_STATUSES.filter((status) => status !== grievance.status).map((value) => ({ value, label: grievanceStatusLabel(value) }))
  const [status, setStatus] = useState<(typeof options)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<{ status?: string; note?: string }>({})
  const change = useChange(grievance, 'status', (next) => `${next.code} is now ${grievanceStatusLabel(next.status)}`, onClose)
  const closing = status === 'closed'

  function commit() {
    const next = { status: status ? undefined : 'Choose a status', note: closing && !note.trim() ? 'Say why it is being closed' : undefined }
    setMissing(next)
    if (!next.status && !next.note) void change.send({ status, note })
  }

  return (
    <ChangeSheet title="Change status" grievance={grievance} submit="Change status" change={change} onSubmit={commit} onClose={onClose}>
      <Field label="New status" hint={`It is ${grievanceStatusLabel(grievance.status)} now.`} error={missing.status ?? change.field('status')}>
        <Segmented value={status} onChange={setStatus} options={options} />
      </Field>
      {closing && <Alert>A closed grievance takes no new actions or events and cannot be edited until it is reopened.</Alert>}
      <Field label="Note" optional={!closing} hint="Shown on the timeline with the change." error={missing.note ?? change.field('note')}>
        <Note value={note} onChange={setNote} />
      </Field>
    </ChangeSheet>
  )
}

function OwnerSheet({ grievance, onClose }: { grievance: GrievanceDetail; onClose: () => void }) {
  const { data: employees = [] } = useQuery(employeesQuery)
  const { data: accountHolders } = useQuery(grievanceAccountHoldersQuery)
  const user = useUser()
  const [owner, setOwner] = useState<EmployeeRow | null>(null)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange(grievance, 'owner', (next) => `${next.code} is now owned by ${next.owner.name}`, onClose)
  const candidates = employees.filter((person) => person.state === 'active' && person.id !== grievance.owner.id)
  // Handing it on ends the say of whoever hands it, unless they are a Super Admin.
  const losesIt = owner && !canManageGrievance(user, owner.id)
  const noAccount = ownerAccountNote(owner, accountHolders)

  function commit() {
    setMissing(owner ? undefined : 'Choose an owner')
    if (owner) void change.send({ ownerId: owner.id, note })
  }

  return (
    <ChangeSheet title="Change owner" grievance={grievance} submit="Change owner" change={change} onSubmit={commit} onClose={onClose}>
      <Field label="New owner" hint={`${grievance.owner.name} owns it now.`} error={missing ?? change.field('ownerId')}>
        <Combobox
          items={candidates}
          value={owner}
          onChange={(next) => {
            setMissing(undefined)
            setOwner(next)
          }}
          getKey={(person) => person.id}
          getLabel={(person) => person.name}
          getSearch={(person) => person.code}
          placeholder="Search by name or Employee ID"
          emptyText="No active employee matches"
        />
      </Field>
      {noAccount && <Alert tone="warn">{noAccount}</Alert>}
      {losesIt && !noAccount && <Alert>Once {owner.name} owns it, you will no longer be able to change this grievance.</Alert>}
      <Field label="Note" optional hint="Shown on the timeline with the change." error={change.field('note')}>
        <Note value={note} onChange={setNote} />
      </Field>
    </ChangeSheet>
  )
}

function VoidSheet({ grievance, onClose }: { grievance: GrievanceDetail; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange(grievance, 'void', (next) => `${next.code} voided`, onClose)

  function commit() {
    setMissing(reason.trim() ? undefined : 'Say why it is being voided')
    if (reason.trim()) void change.send({ reason })
  }

  return (
    <ChangeSheet title="Void this grievance" grievance={grievance} submit="Void grievance" danger change={change} onSubmit={commit} onClose={onClose}>
      <Alert tone="warn" title="This cannot be undone">
        A voided grievance is kept as a record, with its timeline and this reason, but nothing about it can be changed again and it leaves every list but All. Use it for a
        grievance entered by mistake; one that has run its course is closed instead.
      </Alert>
      <Field label="Reason" hint="Shown on the timeline." error={missing ?? change.field('reason')}>
        <Note value={reason} onChange={setReason} />
      </Field>
    </ChangeSheet>
  )
}
