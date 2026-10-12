import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Copy, KeyRound, Lock, LockOpen, ShieldCheck, ShieldOff, UserPlus, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABEL, type Role } from '@shared/constants.ts'
import type { UserRow, UserWithPassword } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Combobox } from '@/components/ui/combobox.tsx'
import { Alert, EmptyState, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Segmented } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { Stacked } from '@/features/common/status.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { formatDateTime, formatRelative, formatTime } from '@/lib/format.ts'
import { lookupsQuery, usersQuery } from '@/lib/queries.ts'
import { useCan, usePageTitle, useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/users')({
  component: UsersPage,
})

function UsersPage() {
  usePageTitle('Users')
  const allowed = useCan('users.manage')
  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Users" />
        <Panel>
          <EmptyState
            icon={Lock}
            title="Super Admin only"
            description="Creating accounts, resetting another user's password and deactivating accounts stay with Super Admins. An Admin who could edit accounts could promote themselves."
            className="py-20"
          />
        </Panel>
      </div>
    )
  }
  return <UsersTable />
}

function copyText(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text)
      return true
    }
    // Plain-HTTP office deployments have no async clipboard, so fall back to the old way.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Shown exactly once after an account is created or a password is reset. */
function OneTimePassword({ result, onClose }: { result: UserWithPassword; onClose: () => void }) {
  const toast = useToast()
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-panel border border-line bg-surface p-6 shadow-pop outline-none">
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">One-time password for {result.user.name}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-5 text-ink-2">
            Give this to them in person or over a channel you trust. It is shown only now, and they must choose a new password the first time they sign in.
          </Dialog.Description>
          <div className="mt-4 flex items-center gap-2 rounded-control border border-line-strong bg-canvas p-1.5 pl-4">
            <code className="min-w-0 flex-1 select-all truncate font-mono text-lg font-medium tracking-wide">{result.oneTimePassword}</code>
            <Button
              icon={<Copy className="size-4" />}
              onClick={() => toast(copyText(result.oneTimePassword) ? { title: 'Password copied' } : { tone: 'warn', title: 'Could not copy', description: 'Select the password and press Ctrl+C.' })}
            >
              Copy
            </Button>
          </div>
          <p className="mt-3 font-mono text-xs text-ink-3">{result.user.email}</p>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              I have noted it
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StateBadge({ user }: { user: UserRow }) {
  if (user.state === 'locked') return <Badge tone="warn">Locked until {user.lockedUntil ? formatTime(user.lockedUntil) : ''}</Badge>
  if (user.state === 'deactivated') return <Badge tone="neutral">Deactivated</Badge>
  return <Badge tone="ok">Active</Badge>
}

function UserActions({ user, onSecret }: { user: UserRow; onSecret: (result: UserWithPassword) => void }) {
  const me = useUser()
  const [confirm, setConfirm] = useState<'reset' | 'deactivate' | null>(null)
  const reset = useWrite(async () => {
    const result = await api.post<UserWithPassword>(`/users/${user.id}/reset-password`)
    // Handed over before useWrite refetches the lists: a password that is shown only once must not wait on a refetch.
    setConfirm(null)
    onSecret(result)
    return result
  })
  const unlock = useWrite(() => api.post(`/users/${user.id}/clear-lock`), { success: `Lock cleared for ${user.name}` })
  const deactivate = useWrite(() => api.post(`/users/${user.id}/deactivate`), { success: `${user.name} deactivated` })
  const reactivate = useWrite(() => api.post(`/users/${user.id}/reactivate`), { success: `${user.name} reactivated` })
  const changeRole = useWrite((role: Role) => api.patch(`/users/${user.id}`, { role }), { success: `${user.name} is now ${ROLE_LABEL[user.role === 'admin' ? 'super_admin' : 'admin']}` })
  const isMe = user.id === me.id

  const items: MenuItem[] = [
    { label: 'Reset password', icon: KeyRound, onSelect: () => setConfirm('reset'), disabledReason: isMe ? 'Use "Change password" in your user menu.' : undefined },
    { label: 'Clear lock', icon: LockOpen, onSelect: () => unlock.mutate(undefined), disabledReason: user.state === 'locked' || user.failedLogins > 0 ? undefined : 'This account is not locked.' },
    user.role === 'admin'
      ? { label: 'Make Super Admin', icon: ShieldCheck, onSelect: () => changeRole.mutate('super_admin') }
      : { label: 'Make Admin', icon: ShieldOff, onSelect: () => changeRole.mutate('admin'), disabledReason: isMe ? 'You cannot change your own role.' : undefined },
    user.state === 'deactivated'
      ? { label: 'Reactivate', icon: UserRoundCheck, onSelect: () => reactivate.mutate(undefined), separatorBefore: true }
      : { label: 'Deactivate', icon: UserRoundX, tone: 'danger', separatorBefore: true, onSelect: () => setConfirm('deactivate'), disabledReason: isMe ? 'You cannot deactivate your own account.' : undefined },
  ]
  return (
    <div className="flex justify-end">
      <Menu label={`Actions for ${user.name}`} items={items} />
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Reset ${user.name}'s password?`}
        description="Their current password stops working, any signed-in sessions end, and they must set a new password at next sign-in. You will see a one-time password to hand over."
        confirmLabel="Reset password"
        onConfirm={() => reset.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Deactivate ${user.name}?`}
        description="They are signed out and cannot sign in again until reactivated. Their history stays: accounts with condition or audit history are deactivated, never deleted."
        confirmLabel="Deactivate"
        tone="danger"
        onConfirm={() => deactivate.mutateAsync(undefined)}
      />
    </div>
  )
}

const c = columnsFor<UserRow>()

function UsersTable() {
  const { data = [], isPending } = useQuery({ ...usersQuery })
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<UserWithPassword | null>(null)

  const [columns] = useState(() => [
    c.accessor('name', { header: 'User', cell: (info) => <Stacked primary={<span className="font-medium">{info.getValue()}</span>} secondary={<Mono>{info.row.original.email}</Mono>} /> }),
    c.accessor('role', { header: 'Role', cell: (info) => <Badge tone={info.getValue() === 'super_admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[info.getValue()]}</Badge>, meta: { hideBelow: 'sm' } }),
    c.accessor('state', { header: 'Status', cell: (info) => <StateBadge user={info.row.original} /> }),
    c.accessor('failedLogins', { header: 'Failed logins', cell: (info) => <span className={info.getValue() >= 3 ? 'font-semibold text-warn' : 'text-ink-2'}>{info.getValue()}</span>, meta: { align: 'right', hideBelow: 'lg' } }),
    c.accessor('mustChangePassword', { header: 'Password', cell: (info) => (info.getValue() ? <Badge tone="warn">Must change</Badge> : <span className="text-ink-3">Set</span>), meta: { hideBelow: 'lg' } }),
    c.accessor((row) => row.lastLoginAt ?? '', { id: 'lastLogin', header: 'Last sign-in', cell: (info) => (info.row.original.lastLoginAt ? <span title={formatDateTime(info.row.original.lastLoginAt)}>{formatRelative(info.row.original.lastLoginAt)}</span> : <span className="text-ink-3">Never</span>), meta: { hideBelow: 'md' } }),
    c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <UserActions user={info.row.original} onSecret={setSecret} />, meta: { align: 'right', width: 'w-16' } }),
  ])
  const table = useGrid({ data, columns, getRowId: (row) => String(row.id), initialSorting: [{ id: 'name', desc: false }] })
  const locked = data.filter((u) => u.state === 'locked').length
  const off = data.filter((u) => u.state === 'deactivated').length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description={`${data.length} accounts${locked ? `, ${locked} locked` : ''}${off ? `, ${off} deactivated` : ''}. Five wrong passwords lock an account for 15 minutes; a new account starts with a one-time password.`}
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
            New account
          </Button>
        }
      />
      <DataGrid table={table} label="Users" noun="accounts" loading={isPending} empty={null} />
      <p className="text-sm text-ink-3">A user with condition or audit history is deactivated, never deleted.</p>
      {creating && <NewAccountSheet onClose={() => setCreating(false)} onCreated={setSecret} />}
      {secret && <OneTimePassword result={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function NewAccountSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (result: UserWithPassword) => void }) {
  const { data: lookups } = useQuery(lookupsQuery)
  const people = lookups?.employees ?? []
  const [error, setError] = useState<ApiError | null>(null)
  const create = useWrite((body: { name: string; email: string; role: Role; employeeId: number | null }) => api.post<UserWithPassword>('/users', body), { silent: true })

  const form = useForm({
    defaultValues: { name: '', email: '', role: 'admin' as Role, employee: null as (typeof people)[number] | null },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.name.trim()) fields.name = 'Enter their name.'
        if (!/^\S+@\S+\.\S+$/.test(value.email.trim())) fields.email = 'Enter a valid email address.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await create.mutateAsync({ name: value.name, email: value.email, role: value.role, employeeId: value.employee?.id ?? null })
        onClose()
        onCreated(result)
      } catch (e) {
        if (e instanceof ApiError) setError(e)
      }
    },
  })
  const submitted = form.state.submissionAttempts > 0

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="New account"
      description="They get a one-time password and must choose their own on first sign-in."
      footer={
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="new-user-form" loading={submitting}>
                Create account
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <form
        id="new-user-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        {error && error.code !== 'duplicate_email' && !error.fields.email && (
          <Alert tone="bad" title="Could not create the account">
            {error.message}
          </Alert>
        )}
        <form.Field name="name">
          {(field) => (
            <Field label="Full name" error={fieldError(field, undefined, submitted)}>
              <Input autoFocus value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Field label="Email" error={(error?.code === 'duplicate_email' || error?.fields.email ? error.message : null) ?? fieldError(field, undefined, submitted)}>
              <Input type="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Field name="role">
          {(field) => (
            <Field label="Role" hint={field.state.value === 'super_admin' ? 'Can delete records, archive employees and manage accounts.' : 'Can add and change records. Cannot delete or manage accounts.'}>
              <Segmented
                label="Role"
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: 'admin', label: 'Admin', tone: 'accent' },
                  { value: 'super_admin', label: 'Super Admin', tone: 'accent' },
                ]}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name="employee">
          {(field) => (
            <Field label="Linked employee" optional hint="Fills in “Assessed by” for them when issuing and returning.">
              <Combobox items={people} value={field.state.value} onChange={field.handleChange} getKey={(p) => p.id} getLabel={(p) => `${p.name} · ${p.code}`} getSearch={(p) => p.department ?? ''} placeholder="Search employees" />
            </Field>
          )}
        </form.Field>
      </form>
    </Sheet>
  )
}
