import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link, useLinkProps } from '@tanstack/react-router'
import { Ellipsis, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { APP_NAME } from '@/lib/brand.ts'
import { cn } from '@/lib/cn.ts'
import { areasFor, fitRail, type NavArea } from '@/lib/nav.ts'
import { useUser } from '@/lib/session.ts'
import { useArea } from '@/lib/workspace.ts'
import { NotificationBell } from '@/features/notifications/parts.tsx'
import { LogoMark } from '../ui/logo.tsx'
import { Tooltip } from '../ui/tooltip.tsx'
import { AccountMenu } from './account-menu.tsx'

// One rail item is exactly RAIL_ITEM_HEIGHT (56px, h-14) tall with no gap between items, so `fitRail` counts true.
const itemStyle =
  'group flex h-14 w-[4.875rem] shrink-0 flex-col items-center gap-[3px] rounded-control pt-1 text-xs font-medium tracking-[-0.005em] focus-visible:-outline-offset-2'
const tileStyle =
  'flex h-8 w-[2.625rem] items-center justify-center rounded-control transition-colors duration-150 motion-reduce:transition-none'
const iconButtonStyle =
  'flex size-9 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-rail-hover hover:text-ink motion-reduce:transition-none'

function RailTile({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <>
      <span
        className={cn(
          tileStyle,
          active
            ? 'bg-surface text-workspace shadow-panel ring-1 ring-line'
            : 'text-ink-2 group-hover:bg-rail-hover group-hover:text-ink group-data-[state=open]:bg-rail-hover',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="max-w-full truncate leading-4">{label}</span>
    </>
  )
}

function RailLink({ area, active }: { area: NavArea; active: boolean }) {
  // Link would mark itself aria-current="page" whenever the address sits under its target, so the props are taken from
  // useLinkProps and the rail's own state, "this area", is set last.
  const linkProps = useLinkProps({ to: area.home })
  const link = (
    <a
      {...linkProps}
      aria-label={area.name}
      aria-current={active ? 'true' : undefined}
      className={cn(itemStyle, active ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink')}
    >
      <RailTile icon={area.icon} label={area.label} active={active} />
    </a>
  )
  // The short label ("Tasks") leaves out part of the name, so the full one shows on hover and focus.
  return area.name === area.label ? (
    link
  ) : (
    <Tooltip content={area.name} side="right">
      {link}
    </Tooltip>
  )
}

/** The areas that did not fit the window's height. No count shows here either. */
function MoreMenu({ areas }: { areas: NavArea[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="More workspaces"
          className={cn(itemStyle, 'text-ink-2 hover:text-ink data-[state=open]:text-ink')}
        >
          <RailTile icon={Ellipsis} label="More" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-60 animate-pop-in rounded-panel border border-line bg-surface p-1.5 shadow-pop"
        >
          {areas.map((area) => (
            <DropdownMenu.Item key={area.id} asChild>
              <Link
                to={area.home}
                className="flex h-9 cursor-default items-center gap-2.5 rounded-[6px] px-2.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-sunken"
              >
                <area.icon className="size-4 text-ink-3" aria-hidden />
                {area.name}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** The rail's list height, kept up to date. It starts unbounded, so the first paint shows every area rather than a More. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState(Number.POSITIVE_INFINITY)
  // Measured before paint, so a short window does not flash the full list first.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setHeight(element.clientHeight)
    const observer = new ResizeObserver(() => setHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, height] as const
}

/** The desktop rail: logo, the pages panel toggle, Home and each workspace the account can read, then the bell and account. */
export function Rail({ collapsed, onTogglePanel }: { collapsed: boolean; onTogglePanel: () => void }) {
  const user = useUser()
  const current = useArea()
  const areas = areasFor(user)
  const [listRef, height] = useHeight<HTMLElement>()
  const { shown, overflow } = fitRail(
    areas.length,
    height,
    areas.findIndex((area) => area.id === current),
  )
  const toggleHint = collapsed ? 'Show pages panel' : 'Hide pages panel'

  return (
    <div className="sticky top-0 hidden h-dvh w-[5.25rem] shrink-0 flex-col items-center bg-rail pb-2.5 pt-2 lg:flex">
      <div className="flex flex-col items-center gap-1.5 pb-3">
        <Link
          to="/me/inbox"
          aria-label={`${APP_NAME}: Home`}
          className="flex size-11 items-center justify-center rounded-control"
        >
          <LogoMark />
        </Link>
        <Tooltip content={toggleHint} side="right">
          <button
            type="button"
            aria-label="Pages panel"
            aria-expanded={!collapsed}
            aria-controls="pages-panel"
            onClick={onTogglePanel}
            className={iconButtonStyle}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </button>
        </Tooltip>
      </div>

      {/* Only the areas that fit are drawn; the rest sit under More, so a hidden one is never a stray link. */}
      <nav
        ref={listRef}
        aria-label="Workspaces"
        className="flex min-h-0 w-full flex-1 flex-col items-center overflow-hidden"
      >
        {shown.map((index) => {
          const area = areas[index]!
          return <RailLink key={area.id} area={area} active={area.id === current} />
        })}
        {overflow.length > 0 && <MoreMenu areas={overflow.map((index) => areas[index]!)} />}
      </nav>

      <div className="flex flex-col items-center gap-2 pt-2">
        <NotificationBell align="start" />
        <AccountMenu variant="rail" />
      </div>
    </div>
  )
}
