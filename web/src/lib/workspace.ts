import { useRouterState } from '@tanstack/react-router'
import { WORKSPACES, WORKSPACE_LABEL, type Workspace } from '@shared/constants.ts'
import type { RoutePath } from '@/modules.ts'
import { workspaces } from '@/registry.ts'
import { once } from './once.ts'

export { WORKSPACE_LABEL, type Workspace }

/** Each workspace's first page, which its rail link opens. */
export const workspaceHome = (workspace: Workspace): RoutePath =>
  workspaces().find((entry) => entry.id === workspace)?.home ?? '/'

// The deepest home first, so the workspace at `/` only takes what no other holds.
const byDepth = once(() => [...workspaces()].sort((a, b) => b.home.length - a.home.length))

/**
 * The address decides the workspace, so a link, a reload and the back button always land on the right side: the workspace
 * whose home the address is at or under.
 */
export const workspaceOf = (pathname: string): Workspace =>
  (
    byDepth().find(({ home }) => home === '/' || pathname === home || pathname.startsWith(`${home}/`)) ??
    workspaces()[0]!
  ).id as Workspace

export function useWorkspace(): Workspace {
  return useRouterState({ select: (state) => workspaceOf(state.location.pathname) })
}

/** Where in the app a page sits: a workspace, or My Space, which belongs to the person signed in and needs no access grant. */
export type Area = Workspace | 'me'

export const areaOf = (pathname: string): Area => (/^\/me(?:\/|$)/.test(pathname) ? 'me' : workspaceOf(pathname))

export function useArea(): Area {
  return useRouterState({ select: (state) => areaOf(state.location.pathname) })
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
  return lastWorkspace()
}

/** The workspace used last, which reopening the app returns to. */
export function lastWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(KEY) as Workspace
    return WORKSPACES.includes(saved) ? saved : 'assets'
  } catch {
    return 'assets'
  }
}
