import { createFileRoute, redirect } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'
import { EmployeesPage, employeesSearch } from '@/features/employees/employees-page.tsx'
import { employeesQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/reviews/employees')({
  validateSearch: employeesSearch,
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'employees', 'read')) throw redirect({ to: '/reviews' })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})
