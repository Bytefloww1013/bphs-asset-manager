import { createFileRoute } from '@tanstack/react-router'
import { EmployeesPage, employeesSearch } from '@/features/employees/employees-page.tsx'
import { employeesQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/grievances/employees')({
  validateSearch: employeesSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
