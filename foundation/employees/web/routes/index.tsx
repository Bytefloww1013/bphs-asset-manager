import { createFileRoute, redirect } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'
import { EmployeesPage, employeesSearch } from '../employees-page.tsx'
import { employeesQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/employees/')({
  validateSearch: employeesSearch,
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'employees', 'read')) throw redirect({ to: '/' })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
