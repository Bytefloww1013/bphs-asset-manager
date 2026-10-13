import { createFileRoute } from '@tanstack/react-router'
import { Scale } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { PageHeader, Panel } from '@/components/ui/layout.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'

export const Route = createFileRoute('/_app/grievances/')({
  component: GrievancesPage,
})

function GrievancesPage() {
  useGrievancePageTitle()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Grievances" description="Employee grievances and what was done about each one. Confidential." />
      <Panel>
        <EmptyState icon={Scale} title="No grievances yet" description="Grievances recorded here will be listed on this page." />
      </Panel>
    </div>
  )
}
