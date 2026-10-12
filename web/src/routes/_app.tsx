import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/app-shell.tsx'
import { IssueSheet } from '@/features/assignments/issue-sheet.tsx'
import { ReturnSheet } from '@/features/assignments/return-sheet.tsx'
import { lookupsQuery, meQuery } from '@/lib/queries.ts'
import { returnPath } from '@/lib/session.ts'

export interface SheetSearch {
  /** Open the Issue sheet for this asset id, or 'new' to pick one. */
  issue?: number | 'new'
  /** Open the Return sheet for this assignment id. */
  return?: number
  /** Preselect this employee in the Issue sheet. */
  employee?: number
  /** Issue to a program instead: this one, or 'pick' to choose it in the sheet. */
  program?: number | 'pick'
}

const toId = (value: unknown) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export const Route = createFileRoute('/_app')({
  validateSearch: (search: Record<string, unknown>): SheetSearch => ({
    issue: search.issue === 'new' ? 'new' : toId(search.issue),
    return: toId(search.return),
    employee: toId(search.employee),
    program: search.program === 'pick' ? 'pick' : toId(search.program),
  }),
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: returnPath(location.href) } })
    if (user.mustChangePassword) throw redirect({ to: '/password-change' })
  },
  // Pickers in the Issue and Return sheets need these; fetch once, up front.
  loader: ({ context }) => context.queryClient.ensureQueryData(lookupsQuery),
  component: () => (
    <AppShell>
      <Outlet />
      <IssueSheet />
      <ReturnSheet />
    </AppShell>
  ),
})
