import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { ACCESS_LEVEL_LABEL, SECTION_LABEL, SECTIONS } from '@shared/constants.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { buttonStyles } from '@/components/ui/button.tsx'
import { Fact, Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { LEVEL_HELP } from '@/features/users/level-help.ts'
import { employeesQuery } from '@/lib/queries.ts'
import { usePageTitle, useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/me/profile')({ component: ProfilePage })

function ProfilePage() {
  usePageTitle('Profile')
  const user = useUser()
  // Every account may list employees, whatever its access; /lookups needs Assets.
  const { data: employees } = useQuery(employeesQuery)
  const employee = employees?.find((one) => one.id === user.employeeId)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profile"
        description="Your account as the app knows it. Only a Super Admin can change these details, on the Users screen."
        actions={
          <Link to="/password-change" className={buttonStyles()}>
            <KeyRound className="size-4" aria-hidden /> Change password
          </Link>
        }
      />

      <Panel aria-label="Account">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          <Fact label="Name">{user.name}</Fact>
          <Fact label="Email">
            <Mono className="[overflow-wrap:anywhere]">{user.email}</Mono>
          </Fact>
          <Fact label="Linked employee">
            {user.employeeId === null ? (
              <span className="font-normal text-ink-3">{user.firstAccount ? 'None. The first account needs no employee.' : 'None'}</span>
            ) : employee ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{employee.name}</span>
                <Mono className="text-xs font-normal text-ink-3">{employee.code}</Mono>
                {/* Archiving an employee leaves their account linked. */}
                {employee.state === 'archived' && (
                  <Badge tone="neutral" dot={false}>
                    archived
                  </Badge>
                )}
              </span>
            ) : (
              <span className="font-normal text-ink-3">…</span>
            )}
          </Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Access" description="What you can see and do in each section." />
        {user.superAdmin ? (
          <div className="flex flex-col items-start gap-2 border-t border-line px-5 py-4">
            <Badge tone="accent">Super Admin</Badge>
            <p className="text-sm text-ink-2">Full access to every section, including any added later, and the only accounts that can manage accounts.</p>
          </div>
        ) : (
          <dl className="divide-y divide-line border-t border-line">
            {SECTIONS.map((section) => {
              const level = user.access[section] ?? 'none'
              return (
                <div key={section} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm font-medium text-ink">{SECTION_LABEL[section]}</dt>
                  <dd className="text-sm">
                    <span className={level === 'none' ? 'text-ink-3' : 'font-medium text-ink'}>{ACCESS_LEVEL_LABEL[level]}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">{LEVEL_HELP[section][level]}</span>
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </Panel>
    </div>
  )
}
