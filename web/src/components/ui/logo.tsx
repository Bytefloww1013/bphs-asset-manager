import { cn } from '@/lib/cn.ts'
import { APP_NAME, ORGANIZATION_NAME } from '@/lib/brand.ts'

export function LogoMark({ className, label = '' }: { className?: string; label?: string }) {
  return (
    <img src="/brand/brightpath-mark.svg" width="32" height="32" alt={label} className={cn('size-8 shrink-0 object-contain', className)} />
  )
}

/** Corporate signature and live app identity for the existing authentication-page slot. */
export function AuthBrand({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <img src="/brand/brightpath-header.svg" width="1002" height="295" alt={ORGANIZATION_NAME} className="h-auto w-[16.25rem] max-w-full" />
      <span className="text-md font-semibold tracking-[-0.01em] text-ink">{APP_NAME}</span>
    </div>
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
