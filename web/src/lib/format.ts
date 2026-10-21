import { OVERDUE_DAYS } from '@shared/constants.ts'

const pad = (n: number) => String(n).padStart(2, '0')

/** 2026-07-27, in the viewer's local time. ISO-style so it sorts and never reads as day/month. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The reverse of formatDate: the instant a `YYYY-MM-DD` starts at in the viewer's local time, or the start of a later day.
 * Null if it is not a day on the calendar (2026-02-31).
 */
export function startOfLocalDay(date: string, daysAfter = 0): string | null {
  const start = new Date(`${date}T00:00:00`)
  // Some browsers read 2026-02-31 as 3 March, so the month and day that come out must be the ones that went in. Not the year: a
  // date input being typed into passes through 0002, 0020 and 0202 on its way to 2026.
  if (Number.isNaN(start.getTime()) || `${pad(start.getMonth() + 1)}-${pad(start.getDate())}` !== date.slice(-5))
    return null
  // The next day is found on the calendar rather than by adding 24 hours: the day a clock changes has 23 or 25.
  start.setDate(start.getDate() + daysAfter)
  return start.toISOString()
}

/** 2026-07-27 14:07 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

/** "5 min. ago", "yesterday", "3 days ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86_400 * 30) return relative.format(Math.round(seconds / 86_400), 'day')
  return formatDate(iso)
}

export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—'
  return `${days.toLocaleString()} d`
}

export const isOverdue = (days: number | null | undefined) => days !== null && days !== undefined && days > OVERDUE_DAYS

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}
