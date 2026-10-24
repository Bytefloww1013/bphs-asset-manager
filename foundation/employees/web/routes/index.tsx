import { createFileRoute, notFound } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'
import { EmployeesPage, employeesSearch } from '../employees-page.tsx'
import { employeesQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/employees/')({
  validateSearch: employeesSearch,
  // The sidebar leaves the page out without Employees; reached by its address, it is not found (issue #27).
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'employees', 'read')) throw notFound()
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
