import { createFileRoute, redirect } from '@tanstack/react-router'

// Importing employees used to live here. Bookmarks and old links land on the page that replaced it, with Employees chosen.
export const Route = createFileRoute('/_app/employees/import')({
  beforeLoad: () => {
    throw redirect({ to: '/import-export', search: { type: 'employees' }, replace: true })
  },
})
