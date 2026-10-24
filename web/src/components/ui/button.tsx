import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'
import { Tooltip } from './tooltip.tsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,box-shadow] duration-150 outline-offset-2 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-primary hover:bg-accent-hover disabled:bg-line disabled:text-ink-3 disabled:shadow-none aria-disabled:bg-line aria-disabled:text-ink-3 aria-disabled:shadow-none',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-panel hover:bg-sunken disabled:text-ink-3 disabled:hover:bg-surface aria-disabled:text-ink-3 aria-disabled:hover:bg-surface',
  ghost:
    'text-ink-2 hover:bg-sunken hover:text-ink disabled:text-ink-3 aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent',
  danger:
    'bg-bad text-on-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.12)] hover:brightness-90 disabled:bg-line disabled:text-ink-3 aria-disabled:bg-line aria-disabled:text-ink-3',
  'danger-ghost':
    'text-bad hover:bg-bad-soft disabled:text-ink-3 aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-10 gap-2 px-4 text-md',
}

/** Class names for a link that should look like a button, such as a download or a router Link. Do not put a Button inside a link: that is two interactive elements, and two tab stops, for one action. */
export const buttonStyles = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) =>
  cn(base, variants[variant], sizes[size], className)

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  /**
   * Keeps the button focusable but inert and explains why. Only for a record rule that blocks an action the account may use
   * ("Has assignment history. Mark it inactive instead.") or a placeholder; a button the account's access doesn't allow is not
   * drawn at all (issue #27).
   */
  disabledReason?: string
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  disabledReason,
  className,
  children,
  onClick,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  const blocked = Boolean(disabledReason)
  const button = (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-disabled={blocked || undefined}
      onClick={blocked ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
  return blocked ? <Tooltip content={disabledReason}>{button}</Tooltip> : button
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'size'> {
  label: string
  size?: 'sm' | 'md'
  children: ReactNode
}

/** Square icon-only button. `label` becomes both the accessible name and the tooltip. */
export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  className,
  children,
  disabledReason,
  ...rest
}: IconButtonProps) {
  const button = (
    <Button
      variant={variant}
      aria-label={label}
      disabledReason={disabledReason}
      className={cn('p-0', size === 'sm' ? 'size-8' : 'size-9', className)}
      {...rest}
    >
      {children}
    </Button>
  )
  return disabledReason ? button : <Tooltip content={label}>{button}</Tooltip>
}
