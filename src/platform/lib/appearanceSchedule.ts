import type { PerformerAppearance } from './types'

export type AppearancePeriod = 'today' | 'tomorrow' | 'week' | 'month'

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00+09:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date)
}

export function appearancePeriodRange(period: AppearancePeriod, now = new Date()) {
  const today = dateKey(now)
  if (period === 'today') return { start: today, end: today }
  if (period === 'tomorrow') {
    const tomorrow = addDays(today, 1)
    return { start: tomorrow, end: tomorrow }
  }
  if (period === 'week') {
    const weekday = new Date(`${today}T12:00:00+09:00`).getUTCDay()
    return { start: today, end: addDays(today, 7 - weekday) }
  }
  const [year, month] = today.split('-').map(Number)
  const end = dateKey(new Date(Date.UTC(year, month, 0, 3)))
  return { start: today, end }
}

export function filterAppearancesForPeriod(
  rows: PerformerAppearance[],
  period: AppearancePeriod,
  now = new Date(),
) {
  const { start, end } = appearancePeriodRange(period, now)
  return rows.filter((row) => row.status === 'published' && row.performance_date >= start && row.performance_date <= end)
}
