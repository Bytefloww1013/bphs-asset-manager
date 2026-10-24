import { createFileRoute, redirect } from '@tanstack/react-router'
import { Slot } from '@/components/slot.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { usePageTitle } from '@/lib/session.ts'
import { slot } from '@/registry.ts'

// Home's dashboard draws the modules' widgets (`home.widgets`). Until a module gives one, Home opens on the Inbox, as it always has.
export const Route = createFileRoute('/_app/me/')({
  beforeLoad: ({ context }) => {
    if (!slot('home.widgets', context.user).length) throw redirect({ to: '/me/inbox', replace: true })
  },
  component: HomeDashboard,
})

function HomeDashboard() {
  usePageTitle('My Dashboard')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Dashboard" />
      <Slot name="home.widgets" props={{}} className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2" />
    </div>
  )
}
