import { EmployeesPage, employeesQuery, employeesSearch } from '#foundation/employees/web/index.ts'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'

export const Route = createFileRoute('/_app/reviews/employees')({
  validateSearch: employeesSearch,
  // The sidebar leaves the page out without Employees; reached by its address, it is not found (issue #27).
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'employees', 'read')) throw notFound()
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
