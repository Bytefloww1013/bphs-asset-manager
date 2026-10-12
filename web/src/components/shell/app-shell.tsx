import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useRouter } from '@tanstack/react-router'
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  KeyRound,
  Laptop,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Menu as MenuIcon,
  PackageCheck,
  ScrollText,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { can } from '@shared/permissions.ts'
import { ROLE_LABEL } from '@shared/constants.ts'
import { cn } from '@/lib/cn.ts'
import { api } from '@/lib/api.ts'
import { initials } from '@/lib/format.ts'
import { useUser } from '@/lib/session.ts'
import { IconButton } from '../ui/button.tsx'
import { Badge } from '../ui/badge.tsx'
import { LogoMark, Wordmark } from '../ui/logo.tsx'

interface NavEntry {
  to: '/' | '/assignments' | '/available' | '/assets' | '/employees' | '/programs' | '/lists' | '/audit' | '/users'
  label: string
  icon: LucideIcon
  locked?: boolean
}

function useNav(): { heading: string; items: NavEntry[] }[] {
  const user = useUser()
  return [
    {
      heading: 'Work',
      items: [
        { to: '/', label: 'Overview', icon: LayoutDashboard },
        { to: '/assignments', label: 'Assignments', icon: ClipboardList },
        { to: '/available', label: 'Available', icon: PackageCheck },
      ],
    },
    {
      heading: 'Records',
      items: [
        { to: '/assets', label: 'Physical Assets', icon: Laptop },
        { to: '/employees', label: 'Employees', icon: Users },
        { to: '/programs', label: 'Programs', icon: Building2 },
      ],
    },
    {
      heading: 'Administration',
      items: [
        { to: '/lists', label: 'Lists', icon: ListChecks },
        { to: '/audit', label: 'Audit log', icon: ScrollText },
        { to: '/users', label: 'Users', icon: ShieldCheck, locked: !can(user.role, 'users.manage') },
      ],
    },
  ]
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNav()
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-3">{group.heading}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === '/' }}
                  className="group flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface/70 hover:text-ink data-[status=active]:bg-surface data-[status=active]:text-ink data-[status=active]:shadow-panel data-[status=active]:ring-1 data-[status=active]:ring-line"
                  activeProps={{ 'aria-current': 'page' }}
                >
                  <item.icon className="size-[1.125rem] shrink-0 text-ink-3 group-data-[status=active]:text-accent" aria-hidden strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.locked && (
                    <>
                      <Lock className="size-3.5 text-ink-3" aria-hidden />
                      <span className="sr-only">Super Admin only</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function UserMenu() {
  const user = useUser()
  const router = useRouter()
  const queryClient = useQueryClient()

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined)
    queryClient.clear()
    await router.navigate({ to: '/login' })
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors hover:bg-surface/70 data-[state=open]:bg-surface"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent ring-1 ring-accent-line">{initials(user.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-ink-3">{ROLE_LABEL[user.role]}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-64 animate-pop-in rounded-panel border border-line bg-surface p-1.5 shadow-pop"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate font-mono text-xs text-ink-3">{user.email}</p>
            <div className="mt-2">
              <Badge tone={user.role === 'super_admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge>
            </div>
          </div>
          <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={() => void router.navigate({ to: '/password-change' })}
            className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-sunken"
          >
            <KeyRound className="size-4" aria-hidden /> Change password
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-sunken"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  // The drawer is only drawn below `lg`. Close it when the window grows past that, or it would stay open, unseen, holding the page.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)')
    const close = () => wide.matches && setDrawer(false)
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Wide screens: a fixed rail on a slightly cooler neutral than the page. */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-sidebar lg:flex">
        <div className="px-4 pb-4 pt-5">
          <Wordmark />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <NavList />
        </div>
        <div className="border-t border-line p-3">
          <UserMenu />
        </div>
      </aside>

      {/* Narrow screens: a slim bar and a drawer carrying the same navigation. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-sidebar px-4 lg:hidden">
        <IconButton label="Open navigation" onClick={() => setDrawer(true)}>
          <MenuIcon className="size-5" />
        </IconButton>
        <LogoMark className="size-7" />
        <span className="text-md font-semibold">BPHS Assets</span>
      </header>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/35 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-fade-in flex-col bg-sidebar shadow-pop outline-none lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">Move between sections of the app</Dialog.Description>
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <Wordmark />
              <Dialog.Close asChild>
                <IconButton label="Close navigation" size="sm">
                  <X className="size-4" />
                </IconButton>
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
            <div className="border-t border-line p-3">
              <UserMenu />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main id="main" className={cn('min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-9')}>
        <div className="mx-auto w-full max-w-[1480px]">{children ?? <Outlet />}</div>
      </main>
    </div>
  )
}
