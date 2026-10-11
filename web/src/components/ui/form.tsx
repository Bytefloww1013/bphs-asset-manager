import { Check, ChevronDown, Search } from 'lucide-react'
import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'
import type { Tone } from './badge.tsx'

const control =
  'w-full rounded-control border border-line-strong bg-surface text-ink shadow-[inset_0_1px_1px_oklch(0.2_0.02_262/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-ink-4 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/20 aria-[invalid=true]:border-bad aria-[invalid=true]:focus-visible:ring-bad/20 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 disabled:hover:border-line-strong'

export function Input({ className, mono, ...rest }: ComponentProps<'input'> & { mono?: boolean }) {
  return <input className={cn(control, 'h-9 px-3 text-sm', mono && 'font-mono text-[0.8125rem]', className)} {...rest} />
}

export function SearchInput({ className, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input type="search" className={cn(control, 'h-9 pl-9 pr-3 text-sm [&::-webkit-search-cancel-button]:cursor-pointer')} {...rest} />
    </div>
  )
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-20 resize-y px-3 py-2 text-sm leading-5', className)} {...rest} />
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-9 appearance-none py-0 pl-3 pr-9 text-sm', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  )
}

export function Checkbox({ className, ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input type="checkbox" className={cn('size-4 cursor-pointer rounded-[4px]', className)} {...rest} />
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block size-[18px] rounded-full bg-surface shadow-[0_1px_2px_oklch(0.2_0.02_262/0.3)] transition-transform duration-150',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  )
}

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}

/** Label + control + hint/error, wired together for assistive tech. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  tone?: Tone
}

const segmentTone: Record<Tone, string> = {
  neutral: 'border-ink-2 bg-ink text-on-accent',
  accent: 'border-accent bg-accent-soft text-accent',
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  bad: 'border-bad-line bg-bad-soft text-bad',
}

/** A radio group drawn as a row of chips. Selection shows a check, so it never relies on colour alone. */
export function Segmented<T extends string | number>({
  id,
  value,
  onChange,
  options,
  label,
  className,
}: {
  id?: string
  value: T | null
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  label?: string
  className?: string
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={cn('flex flex-wrap gap-1.5', className)}
      onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
        event.preventDefault()
        const index = options.findIndex((option) => option.value === value)
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
        const next = options[(index + step + options.length) % options.length]
        if (next) onChange(next.value)
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === null && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm font-medium transition-colors duration-150',
              selected ? segmentTone[option.tone ?? 'accent'] : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {selected && <Check className="size-3.5" aria-hidden strokeWidth={2.5} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Tab-like filter chips with counts, for narrowing a list in place. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-control bg-sunken p-1">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-150',
              selected ? 'bg-surface text-ink shadow-panel' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className={cn('tabular-nums text-xs', selected ? 'text-ink-2' : 'text-ink-3')}>{option.count.toLocaleString()}</span>}
          </button>
        )
      })}
    </div>
  )
}
