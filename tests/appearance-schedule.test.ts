import { describe, expect, it } from 'vitest'
import { appearancePeriodRange, filterAppearancesForPeriod } from '../src/platform/lib/appearanceSchedule'
import type { PerformerAppearance } from '../src/platform/lib/types'

const row = (date: string, status: PerformerAppearance['status'] = 'published') => ({
  id: date + status, performer_id: 'performer', title: 'Show', performance_date: date,
  start_time: '12:00:00', end_time: null, timezone: 'Asia/Tokyo', starts_at: `${date}T03:00:00Z`,
  ends_at: null, venue_name: 'Venue', venue_address: '', region: '', country: 'JP', description: '',
  admission_type: 'free', admission_details: '', image_url: null, ticket_url: null, is_live_planned: false,
  rain_policy: '', organizer_info: '', notes: '', status, published_at: status === 'published' ? '2026-10-01T00:00:00Z' : null,
  cancelled_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}) satisfies PerformerAppearance

describe('appearance schedule periods', () => {
  const now = new Date('2026-10-29T06:00:00Z')

  it('builds ranges in the appearance timezone', () => {
    expect(appearancePeriodRange('today', now, 'Asia/Tokyo')).toEqual({ start: '2026-10-29', end: '2026-10-29' })
    expect(appearancePeriodRange('tomorrow', now, 'Asia/Tokyo')).toEqual({ start: '2026-10-30', end: '2026-10-30' })
    expect(appearancePeriodRange('week', now, 'Asia/Tokyo')).toEqual({ start: '2026-10-29', end: '2026-11-01' })
    expect(appearancePeriodRange('month', now, 'Asia/Tokyo')).toEqual({ start: '2026-10-29', end: '2026-10-31' })
    expect(appearancePeriodRange('today', now, 'America/Los_Angeles')).toEqual({ start: '2026-10-28', end: '2026-10-28' })
  })

  it('keeps only published appearances inside the selected period', () => {
    const rows = [row('2026-10-29'), row('2026-10-30'), row('2026-10-31', 'private'), row('2026-11-01')]
    expect(filterAppearancesForPeriod(rows, 'week', now).map((item) => item.performance_date)).toEqual(['2026-10-29', '2026-10-30', '2026-11-01'])
    expect(filterAppearancesForPeriod(rows, 'month', now).map((item) => item.performance_date)).toEqual(['2026-10-29', '2026-10-30'])
    expect(filterAppearancesForPeriod(rows, 'all', now).map((item) => item.performance_date)).toEqual(['2026-10-29', '2026-10-30', '2026-11-01'])
  })
})
