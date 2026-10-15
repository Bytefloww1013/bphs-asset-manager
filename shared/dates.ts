const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * A maintenance request's date the US way: 10/15/2026, or 10/15/2026 12:40 PM. Zoho writes day first (15-10-2026, or 15-Oct-2026,
 * with a 24-hour time after it for the Added Time), and a request entered here has `YYYY-MM-DD`. Anything else is shown as written.
 */
export function formatUsDate(text: string | null): string | null {
  const m = text?.match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})-(\d{2}|[a-z]{3})-(\d{4}))(?: (\d{2}):(\d{2})(?::\d{2})?)?$/i)
  if (!m) return text
  const year = Number(m[1] ?? m[6])
  const monthText = m[2] ?? m[5]!
  const month = /\d/.test(monthText) ? Number(monthText) : MONTHS.indexOf(monthText.toLowerCase()) + 1
  const day = Number(m[3] ?? m[4])
  // A day that is not on the calendar (31-02-2026) comes back as some other day, so it is shown as written.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (month < 1 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return text
  const us = `${pad(month)}/${pad(day)}/${year}`
  if (!m[7]) return us
  const hour = Number(m[7])
  if (hour > 23 || Number(m[8]) > 59) return text
  return `${us} ${hour % 12 || 12}:${m[8]} ${hour < 12 ? 'AM' : 'PM'}`
}
