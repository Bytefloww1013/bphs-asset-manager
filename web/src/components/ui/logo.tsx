import { cn } from '@/lib/cn.ts'
import { APP_NAME } from '@/lib/brand.ts'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-8 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M10.5 8.5h6.1c.5 0 1 .2 1.4.6l5.4 5.4c.8.8.8 2 0 2.8l-5.1 5.1c-.8.8-2 .8-2.8 0l-5.4-5.4c-.4-.4-.6-.9-.6-1.4V10c0-.8.6-1.5 1-1.5Z"
        fill="#fff"
      />
      <circle cx="13.2" cy="12.2" r="1.5" className="fill-accent" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  const [organization, product] = APP_NAME.split('-')
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-md font-semibold tracking-[-0.01em] text-ink">
        {organization}-<span className="font-medium text-ink-3">{product}</span>
      </span>
    </span>
  )
}
