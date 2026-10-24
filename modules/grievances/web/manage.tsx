import type { EmployeeRow } from '#foundation/employees/shared/index.ts'
import { employeesQuery } from '#foundation/employees/web/index.ts'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ChangeSheet, Note, useChange as useWriteChange } from '@/components/records/change-sheet.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Segmented } from '@/components/ui/form.tsx'
import { useCan, useUser } from '@/lib/session.ts'
import { grievanceStatusLabel } from '../shared/constants.ts'
import { canManageGrievance } from '../shared/permissions.ts'
import { GRIEVANCE_OPEN_STATUSES } from '../shared/schemas.ts'
import type { GrievanceDetail } from '../shared/types.ts'
import { grievanceAccountHoldersQuery } from './queries.ts'

/** What to say under an Owner field when the person chosen has no account that works in Grievances: only Grievances Edit could then change the grievance. */
export function ownerAccountNote(
  owner: { id: number; name: string } | null,
  accountHolders: number[] | undefined,
): string | null {
  if (!owner || !accountHolders || accountHolders.includes(owner.id)) return null
  return `${owner.name} has no account with access to Grievances, so only someone with Edit access to Grievances will be able to change this grievance.`
}

type Task = 'status' | 'owner' | 'void'

/**
 * Edit, Change status, Change owner and Void, for a grievance's page. Each is drawn only for someone who may use it: the first
 * three for the owner or anyone with Edit access to Grievances, Void for Grievances Full (issue #27). A closed grievance keeps
 * Edit and Change owner disabled with the reason. A voided grievance offers none of them, and with nothing to offer this draws
 * nothing. The server refuses whatever the page shows.
 */
export function GrievanceActions({ grievance }: { grievance: GrievanceDetail }) {
  const user = useUser()
  const navigate = useNavigate()
  const canVoid = useCan('grievances', 'full')
  const [task, setTask] = useState<Task | null>(null)
  const canManage = canManageGrievance(user, grievance.owner.id)
  if (grievance.status === 'voided' || (!canManage && !canVoid)) return null
  const closed = grievance.status === 'closed'
  const close = () => setTask(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && (
        <>
          <Button
            disabledReason={closed ? 'Reopen it before editing it.' : undefined}
            onClick={() => void navigate({ to: '/grievances/$code/edit', params: { code: grievance.code } })}
          >
            Edit
          </Button>
          <Button onClick={() => setTask('status')}>Change status</Button>
          <Button
            disabledReason={closed ? 'Reopen it before changing its owner.' : undefined}
            onClick={() => setTask('owner')}
          >
            Change owner
          </Button>
        </>
      )}
      {canVoid && (
        <Button variant="danger-ghost" onClick={() => setTask('void')}>
          Void
        </Button>
      )}
      {task === 'status' && <StatusSheet grievance={grievance} onClose={close} />}
      {task === 'owner' && <OwnerSheet grievance={grievance} onClose={close} />}
      {task === 'void' && <VoidSheet grievance={grievance} onClose={close} />}
    </div>
  )
}

const useChange = (
  grievance: GrievanceDetail,
  action: Task,
  success: (next: GrievanceDetail) => string,
  onClose: () => void,
) => useWriteChange(`/grievances/${grievance.code}/${action}`, success, onClose)
const about = (grievance: GrievanceDetail) => `${grievance.code} · ${grievance.title}`

function StatusSheet({ grievance, onClose }: { grievance: GrievanceDetail; onClose: () => void }) {
  const options = GRIEVANCE_OPEN_STATUSES.filter((status) => status !== grievance.status).map((value) => ({
    value,
    label: grievanceStatusLabel(value),
  }))
  const [status, setStatus] = useState<(typeof options)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<{ status?: string; note?: string }>({})
  const change = useChange(
    grievance,
    'status',
    (next) => `${next.code} is now ${grievanceStatusLabel(next.status)}`,
    onClose,
  )
  const closing = status === 'closed'

  function commit() {
    const next = {
      status: status ? undefined : 'Choose a status',
      note: closing && !note.trim() ? 'Say why it is being closed' : undefined,
    }
    setMissing(next)
    if (!next.status && !next.note) void change.send({ status, note })
  }

  return (
    <ChangeSheet
      title="Change status"
      description={about(grievance)}
      submit="Change status"
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
      <Field
        label="New status"
        hint={`It is ${grievanceStatusLabel(grievance.status)} now.`}
        error={missing.status ?? change.field('status')}
      >
        <Segmented value={status} onChange={setStatus} options={options} />
      </Field>
      {closing && (
        <Alert>A closed grievance takes no new actions or events and cannot be edited until it is reopened.</Alert>
      )}
      <Field
        label="Note"
        optional={!closing}
        hint="Shown on the timeline with the change."
        error={missing.note ?? change.field('note')}
      >
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
  // Handing it on ends the say of whoever hands it, unless they have Edit access to Grievances.
  const losesIt = owner && !canManageGrievance(user, owner.id)
  const noAccount = ownerAccountNote(owner, accountHolders)

  function commit() {
    setMissing(owner ? undefined : 'Choose an owner')
    if (owner) void change.send({ ownerId: owner.id, note })
  }

  return (
    <ChangeSheet
      title="Change owner"
      description={about(grievance)}
      submit="Change owner"
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
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
      {losesIt && !noAccount && (
        <Alert>Once {owner.name} owns it, you will no longer be able to change this grievance.</Alert>
      )}
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
    <ChangeSheet
      title="Void this grievance"
      description={about(grievance)}
      submit="Void grievance"
      danger
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
      <Alert tone="warn" title="This cannot be undone">
        A voided grievance is kept as a record, with its timeline and this reason, but nothing about it can be changed
        again and it leaves every list but All. Use it for a grievance entered by mistake; one that has run its course
        is closed instead.
      </Alert>
      <Field label="Reason" hint="Shown on the timeline." error={missing ?? change.field('reason')}>
        <Note value={reason} onChange={setReason} />
      </Field>
    </ChangeSheet>
  )
}
