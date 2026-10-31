import { expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ filters: [] as string[], pages: [] as unknown[][], from: [] as number[] }))
vi.mock('../src/platform/lib/supabase', () => ({ requireSupabase: () => ({ from: () => {
  const query = {
    select: () => query,
    or: (filter: string) => { fixture.filters.push(filter); return query },
    order: () => query,
    range: async (from: number) => { fixture.from.push(from); return { data: fixture.pages.shift() || [], error: null } },
  }
  return query
} }) }))
import { listUpcomingPublishedAppearances } from '../src/platform/lib/api'
it('retrieves every page, includes unknown endings today and preserves public cancellation notices', async () => {
  const base = { status: 'published', starts_at: '2026-10-31T03:00:00Z', ends_at: null,
    performance_date: '2026-10-31', timezone: 'Asia/Tokyo' }
  fixture.pages = [Array.from({length:1000}, (_,id) => ({...base,id:String(id)})), [
    {...base,id:'cancelled',status:'cancelled',published_at:'2026-10-30T00:00:00Z'},
    {...base,id:'yesterday',performance_date:'2026-10-30',starts_at:'2026-10-30T03:00:00Z'},
  ]]
  const rows = await listUpcomingPublishedAppearances(new Date('2026-10-31T06:57:00Z'))
  expect(rows).toHaveLength(1001)
  expect(rows.at(-1)?.id).toBe('cancelled')
  expect(fixture.from).toEqual([0,1000])
  expect(fixture.filters[0]).toContain('status.eq.published')
  expect(fixture.filters[1]).toContain('and(ends_at.is.null,starts_at.gte.')
})
