import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'
import type { Tone } from './badge.tsx'
import { IconButton } from './button.tsx'

const toneIcon: Record<Tone, LucideIcon> = { neutral: Info, accent: Info, ok: CheckCircle2, warn: AlertTriangle, bad: XCircle }
const toneBox: Record<Tone, string> = {
  neutral: 'border-line bg-sunken text-ink-2',
  accent: 'border-accent-line bg-accent-soft text-ink',
  ok: 'border-ok-line bg-ok-soft text-ink',
  warn: 'border-warn-line bg-warn-soft text-ink',
  bad: 'border-bad-line bg-bad-soft text-ink',
}
const toneIconColor: Record<Tone, string> = { neutral: 'text-ink-3', accent: 'text-accent', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }

export function Alert({ tone = 'neutral', title, children, className, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = toneIcon[tone]
  return (
    <div role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-control border p-3.5', toneBox[tone], className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', toneIconColor[tone])} aria-hidden />
      <div className="min-w-0 flex-1 text-sm leading-5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5 text-ink-2')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-ink-3', className)} aria-label="Loading" />
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse-soft rounded-[6px] bg-sunken', className)} />
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-sunken text-ink-3">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-4 text-md font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ---- Toasts ---------------------------------------------------------------------------

interface ToastInput {
  title: string
  description?: ReactNode
  tone?: Tone
}
interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(0)
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((item) => item.id !== id)), [])
  const push = useCallback(
    (toast: ToastInput) => {
      const id = ++next.current
      setItems((all) => [...all.slice(-3), { ...toast, id }])
      setTimeout(() => dismiss(id), toast.tone === 'bad' ? 9000 : 4500)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-end gap-2 sm:left-auto sm:w-96">
        {items.map((item) => {
          const tone = item.tone ?? 'ok'
          const Icon = toneIcon[tone]
          return (
            <div key={item.id} className="pointer-events-auto flex w-full animate-pop-in items-start gap-3 rounded-panel border border-line bg-surface p-3.5 pr-2 shadow-pop">
              <Icon className={cn('mt-0.5 size-4 shrink-0', toneIconColor[tone])} aria-hidden />
              <div className="min-w-0 flex-1 text-sm leading-5">
                <p className="font-semibold text-ink">{item.title}</p>
                {item.description && <div className="mt-0.5 text-ink-2">{item.description}</div>}
              </div>
              <IconButton label="Dismiss" size="sm" onClick={() => dismiss(item.id)}>
                <X className="size-4" />
              </IconButton>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
