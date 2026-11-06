// Calendar dates for prospective cargo quotes use Costa Rica's business day,
// not the browser's locale nor UTC (both can differ near midnight).
const costaRicaCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

export function costaRicaToday(now: Date = new Date()): string {
  const parts = costaRicaCalendar.formatToParts(now)
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T12:00:00Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isCargoReadyDateOnOrAfterToday(value: string, now: Date = new Date()): boolean {
  return isCalendarDate(value) && value >= costaRicaToday(now)
}
