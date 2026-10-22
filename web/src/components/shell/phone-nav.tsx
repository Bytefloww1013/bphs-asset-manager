import * as Dialog from '@radix-ui/react-dialog'
import { useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Lock, Menu as MenuIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NotificationBell } from '@/features/notifications/parts.tsx'
import { APP_NAME } from '@/lib/brand.ts'
import { areaById, areasFor, navFor } from '@/lib/nav.ts'
import { useUser } from '@/lib/session.ts'
import type { Area } from '@/lib/workspace.ts'
import { Button, IconButton } from '../ui/button.tsx'
import { LogoMark } from '../ui/logo.tsx'
import { AccountMenu } from './account-menu.tsx'
import { PageList } from './page-list.tsx'

type Level = 'pages' | 'workspaces'

const headingStyle = 'text-md font-semibold tracking-[-0.01em] text-ink outline-none'

/** The current page's label: the entry the address matches exactly, else the deepest one it sits under. */
function usePageLabel(area: Area): string | undefined {
  const user = useUser()
  const pathname = useLocation({ select: (location) => location.pathname })
  const entries = navFor(area, user).flatMap((group) => group.items)
  const exact = entries.find((entry) => entry.to === pathname)
  if (exact) return exact.label
  const under = entries
    .filter((entry) => entry.to && pathname.startsWith(`${entry.to}/`))
    .sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0))
  return under[0]?.label
}

function Product() {
  const [organization, product] = APP_NAME.split('-')
  return (
    <span className="text-md font-semibold tracking-[-0.01em] text-ink">
      {organization}-<span className="font-medium text-ink-3">{product}</span>
    </span>
  )
}

/** Narrow screens: a slim bar saying where you are, and a drawer that drills from this area's pages up to every workspace. */
export function PhoneNav({ area }: { area: Area }) {
  const user = useUser()
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<Level>('pages')
  // The area whose pages the drawer shows, which is not the current one after picking another under All workspaces.
  const [shown, setShown] = useState<Area>(area)
  const heading = useRef<HTMLHeadingElement>(null)
  // Set only by a change of level, so opening the drawer leaves focus where Radix puts it.
  const moveFocus = useRef(false)
  const page = usePageLabel(area)
  const shownArea = areaById(shown)
  const close = () => setOpen(false)

  // Every opening starts on the current area's pages, whatever was browsed last time.
  function openDrawer() {
    setLevel('pages')
    setShown(area)
    setOpen(true)
  }
  function go(next: Level, to: Area = shown) {
    moveFocus.current = true
    setShown(to)
    setLevel(next)
  }

  // The old level's buttons are gone, so focus would fall to the dialog: put it on the new level's heading instead.
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    heading.current?.focus()
  }, [level, shown])

  // The drawer is only drawn below `lg`. Close it when the window grows past that, or it would stay open, unseen, holding the page.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)')
    const onChange = () => wide.matches && setOpen(false)
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-sidebar pl-2 pr-3 lg:hidden">
        <IconButton label="Open navigation" onClick={openDrawer}>
          <MenuIcon className="size-5" />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LogoMark className="size-7" />
          <div className="flex min-w-0 flex-col">
            <Product />
            <span className="truncate text-xs text-ink-3">
              {areaById(area).name}
              {page && ` · ${page}`}
            </span>
          </div>
        </div>
        <NotificationBell align="end" />
      </header>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/35 motion-reduce:animate-none lg:hidden" />
          <Dialog.Content
            data-workspace={shown}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] animate-fade-in flex-col bg-sidebar shadow-pop outline-none motion-reduce:animate-none lg:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Move between the pages of a workspace, or pick another workspace
            </Dialog.Description>

            <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2">
              {level === 'pages' ? (
                <Button
                  variant="ghost"
                  className="pl-1.5 pr-2.5"
                  icon={<ChevronLeft className="size-[1.125rem]" aria-hidden />}
                  onClick={() => go('workspaces')}
                >
                  All workspaces
                </Button>
              ) : (
                <span className="pl-2">
                  <Product />
                </span>
              )}
              <Dialog.Close asChild>
                <IconButton label="Close navigation" className="ml-auto">
                  <X className="size-5" />
                </IconButton>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {level === 'pages' ? (
                <>
                  <div className="px-4 pb-2.5 pt-4">
                    <h2 ref={heading} tabIndex={-1} className={headingStyle}>
                      {shownArea.name}
                    </h2>
                    {shownArea.confidential && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-workspace">
                        <Lock className="size-3.5" aria-hidden />
                        Confidential
                      </p>
                    )}
                  </div>
                  <div className="px-3 pb-4">
                    <PageList area={shown} onNavigate={close} />
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 pb-2.5 pt-4">
                    <h2 ref={heading} tabIndex={-1} className={headingStyle}>
                      All workspaces
                    </h2>
                  </div>
                  {/* Picking a workspace only shows its pages here; nothing navigates until a page is chosen. */}
                  <nav aria-label="Workspaces" className="px-2 pb-3">
                    <ul className="flex flex-col gap-0.5">
                      {areasFor(user).map((option) => {
                        const Icon = option.icon
                        return (
                          <li key={option.id}>
                            <button
                              type="button"
                              aria-label={option.name}
                              aria-current={option.id === area ? 'true' : undefined}
                              onClick={() => go('pages', option.id)}
                              className="group flex h-12 w-full items-center gap-3 rounded-control px-2.5 text-left text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface/70 hover:text-ink aria-[current=true]:text-ink"
                            >
                              <span className="grid h-[1.875rem] w-[2.125rem] shrink-0 place-items-center rounded-control bg-surface text-ink-2 ring-1 ring-line group-aria-[current=true]:text-accent group-aria-[current=true]:ring-accent-line">
                                <Icon className="size-[1.125rem]" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1 truncate">{option.name}</span>
                              <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </nav>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-line p-2">
              <AccountMenu variant="row" onNavigate={close} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
