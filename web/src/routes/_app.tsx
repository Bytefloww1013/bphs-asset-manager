import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { canUseWorkspace } from '@shared/permissions.ts'
import { AppShell } from '@/components/shell/app-shell.tsx'
import { Slot } from '@/components/slot.tsx'
import { preloadModules } from '@/registry.ts'
import { requireSession } from '@/lib/session.ts'
import { areaOf, workspaceHome, workspaceToReopen } from '@/lib/workspace.ts'

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
    const user = await requireSession(context.queryClient, location.href, areaOf(location.pathname))
    // Opening the app at its front page goes back to the workspace last used. Asked on every first load, wherever it lands,
    // so that choosing Assets in the switcher later is never undone.
    const reopen = workspaceToReopen()
    if (location.href === '/' && reopen !== 'assets' && canUseWorkspace(user, reopen))
      throw redirect({ to: workspaceHome(reopen) })
    return { user }
  },
  // What the modules' sheets need (the Issue and Return sheets' pickers), fetched once, up front.
  loader: ({ context }) => preloadModules(context.queryClient, context.user),
  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
      <Slot name="app.overlays" props={{}} />
    </AppShell>
  )
}
