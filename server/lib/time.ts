const DAY = 86_400_000

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY))
}

export const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null)
