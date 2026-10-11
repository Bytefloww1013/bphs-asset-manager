import { OVERDUE_DAYS } from '@shared/constants.ts'

const pad = (n: number) => String(n).padStart(2, '0')

/** 2026-07-27, in the viewer's local time. ISO-style so it sorts and never reads as day/month. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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

/** Trigger a browser download of a CSV built in memory (Excel-friendly BOM, formula-safe cells). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    let text = value == null ? '' : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const body = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + body + '\r\n'], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
