import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/ui/layout.tsx'

export const Route = createFileRoute('/_app/maintenance/')({
  component: () => <PageHeader title="Requests" />,
})
