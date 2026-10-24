import { EmployeesPage, employeesQuery, employeesSearch } from '#foundation/employees/web/index.ts'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'

export const Route = createFileRoute('/_app/reviews/employees')({
  validateSearch: employeesSearch,
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'employees', 'read')) throw redirect({ to: '/reviews' })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
