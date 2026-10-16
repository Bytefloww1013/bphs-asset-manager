import { useRouterState } from '@tanstack/react-router'
import { WORKSPACES, WORKSPACE_LABEL, type Workspace } from '@shared/constants.ts'

export { WORKSPACE_LABEL, type Workspace }

/** Each workspace's first page. */
export const WORKSPACE_HOME = { assets: '/', grievances: '/grievances', maintenance: '/maintenance', reviews: '/reviews' } as const satisfies Record<Workspace, string>

/** The address decides the workspace, so a link, a reload and the back button always land on the right side. */
export const workspaceOf = (pathname: string): Workspace => (/^\/(grievances|maintenance|reviews)(?:\/|$)/.exec(pathname)?.[1] as Workspace | undefined) ?? 'assets'

export function useWorkspace(): Workspace {
  return useRouterState({ select: (state) => workspaceOf(state.location.pathname) })
}

// ---- The workspace last used -----------------------------------------------------------------
// Only the name of the workspace is kept in the browser, never anything from inside it.
const KEY = 'bphs.workspace'
let reopened = false

export function rememberWorkspace(workspace: Workspace) {
  try {
    localStorage.setItem(KEY, workspace)
  } catch {
    // Storage is off or full: the app opens on Assets next time.
  }
}

/** The workspace to reopen in, asked once: the first time the app opens at its front page. After that the address alone decides. */
export function workspaceToReopen(): Workspace {
  if (reopened) return 'assets'
  reopened = true
  try {
    const saved = localStorage.getItem(KEY) as Workspace
    return WORKSPACES.includes(saved) ? saved : 'assets'
  } catch {
    return 'assets'
  }
}
