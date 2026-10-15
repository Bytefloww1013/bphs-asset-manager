import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { canUseWorkspace } from '@shared/permissions.ts'
import { AppShell } from '@/components/shell/app-shell.tsx'
import { IssueSheet } from '@/features/assignments/issue-sheet.tsx'
import { ReturnSheet } from '@/features/assignments/return-sheet.tsx'
import { lookupsQuery } from '@/lib/queries.ts'
import { requireSession, useUser } from '@/lib/session.ts'
import { workspaceOf, workspaceToReopen } from '@/lib/workspace.ts'

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
    const user = await requireSession(context.queryClient, location.href, workspaceOf(location.pathname))
    // Opening the app at its front page goes back to the workspace last used. Asked on every first load, wherever it lands,
    // so that choosing Assets in the switcher later is never undone.
    const reopen = workspaceToReopen()
    if (location.href === '/' && reopen === 'grievances' && canUseWorkspace(user.role, 'grievances')) throw redirect({ to: '/grievances' })
    return { assets: canUseWorkspace(user.role, 'assets') }
  },
  // Pickers in the Issue and Return sheets need these; fetch once, up front.
  loader: ({ context }) => (context.assets ? context.queryClient.ensureQueryData(lookupsQuery) : undefined),
  component: AppLayout,
})

function AppLayout() {
  // The Issue and Return sheets are Assets work; an account outside Assets is never shown them.
  const assets = canUseWorkspace(useUser().role, 'assets')
  return (
    <AppShell>
      <Outlet />
      {assets && <IssueSheet />}
      {assets && <ReturnSheet />}
    </AppShell>
  )
}
