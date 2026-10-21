import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'

const tones: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: 'border-line bg-sunken text-ink-2', dot: 'bg-ink-3' },
  accent: { box: 'border-accent-line bg-accent-soft text-accent', dot: 'bg-accent' },
  ok: { box: 'border-ok-line bg-ok-soft text-ok', dot: 'bg-ok' },
  warn: { box: 'border-warn-line bg-warn-soft text-warn', dot: 'bg-warn' },
  bad: { box: 'border-bad-line bg-bad-soft text-bad', dot: 'bg-bad' },
}

/** Status label. Always text, plus a dot or icon, so colour is never the only signal. */
export function Badge({
  tone = 'neutral',
  icon: Icon,
  dot = true,
  className,
  children,
}: {
  tone?: Tone
  icon?: LucideIcon
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium',
        tones[tone].box,
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-3" aria-hidden strokeWidth={2.25} />
      ) : dot ? (
        <span className={cn('size-1.5 rounded-full', tones[tone].dot)} aria-hidden />
      ) : null}
      {children}
    </span>
  )
}

export const toneText: Record<Tone, string> = {
  neutral: 'text-ink-2',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
}
