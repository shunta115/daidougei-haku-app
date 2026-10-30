import type { PerformerAppearance } from './types'

export type AppearancePeriod = 'all' | 'today' | 'tomorrow' | 'week' | 'month'

function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function appearancePeriodRange(period: Exclude<AppearancePeriod, 'all'>, now = new Date(), timeZone = 'UTC') {
  const today = dateKey(now, timeZone)
  if (period === 'today') return { start: today, end: today }
  if (period === 'tomorrow') {
    const tomorrow = addDays(today, 1)
    return { start: tomorrow, end: tomorrow }
  }
  if (period === 'week') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    return { start: today, end: addDays(today, 7 - weekday) }
  }
  const [year, month] = today.split('-').map(Number)
  const end = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10)
  return { start: today, end }
}

export function filterAppearancesForPeriod(
  rows: PerformerAppearance[],
  period: AppearancePeriod,
  now = new Date(),
) {
  return rows.filter((row) => {
    if (row.status !== 'published' && !(row.published_at && ['cancelled', 'postponed'].includes(row.status))) return false
    if (period === 'all') return true
    const { start, end } = appearancePeriodRange(period, now, row.timezone || 'UTC')
    return row.performance_date >= start && row.performance_date <= end
  })
}

