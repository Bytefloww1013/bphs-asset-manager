import { Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { setPanelCollapsed, usePanelCollapsed } from '@/lib/sidebar-prefs.ts'
import { rememberWorkspace, useArea } from '@/lib/workspace.ts'
import { PagesPanel } from './pages-panel.tsx'
import { PhoneNav } from './phone-nav.tsx'
import { QuickSwitcher, useQuickSwitcherShortcut } from './quick-switcher.tsx'
import { Rail } from './rail.tsx'

export function AppShell({ children }: { children?: React.ReactNode }) {
  const area = useArea()
  const collapsed = usePanelCollapsed()
  const [jumping, setJumping] = useState(false)
  useQuickSwitcherShortcut(() => setJumping(true))
  // Home is not a workspace: reopening the app goes to the workspace used before it.
  useEffect(() => {
    if (area !== 'me') rememberWorkspace(area)
  }, [area])
  return (
    <div data-workspace={area} className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* Wide screens: the workspace rail, then the current area's pages, which can fold away. */}
      <Rail collapsed={collapsed} onTogglePanel={() => setPanelCollapsed(!collapsed)} />
      <PagesPanel area={area} collapsed={collapsed} onJump={() => setJumping(true)} />

      {/* Narrow screens: a slim bar and a drawer carrying the same pages. */}
      <PhoneNav area={area} />

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-[1480px]">{children ?? <Outlet />}</div>
      </main>

      <QuickSwitcher open={jumping} onOpenChange={setJumping} />
    </div>
  )
}
