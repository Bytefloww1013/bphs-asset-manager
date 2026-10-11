import { ArrowBigUp, CornerDownLeft } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={cn('rounded-panel border border-line bg-surface shadow-panel', className)} {...rest} />
}

export function PanelHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Row of filters and actions that sits above a table. */
export function Toolbar({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)} {...rest} />
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface px-1.5 font-mono text-xs leading-5 text-ink-2 shadow-[0_1px_0_var(--color-line-strong)]', className)}>
      {children}
    </kbd>
  )
}

/** Drawn key symbols, so keyboard hints use the same icon set as the rest of the UI. */
export const EnterKey = () => <CornerDownLeft className="size-3" strokeWidth={2} aria-label="Enter" />
export const ShiftEnterKeys = () => (
  <span className="inline-flex items-center gap-0.5" aria-label="Shift and Enter">
    <ArrowBigUp className="size-3" strokeWidth={2} />
    <CornerDownLeft className="size-3" strokeWidth={2} />
  </span>
)

/** Identifiers (asset tags, serials, employee ids) read as data, so they get the mono face. */
export function Mono({ className, ...rest }: ComponentProps<'span'>) {
  return <span className={cn('font-mono text-[0.8125rem] tabular-nums', className)} {...rest} />
}
