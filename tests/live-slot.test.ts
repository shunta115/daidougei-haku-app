import { describe, expect, it } from 'vitest'
import { selectLiveEventSlot } from '../src/platform/lib/api'

const slots = [
  { id: 'round-3', venue_id: 'main', date: '2026-10-10', start_time: '15:00', end_time: '15:30' },
  { id: 'round-1', venue_id: 'main', date: '2026-10-10', start_time: '11:00', end_time: '11:30' },
  { id: 'round-2', venue_id: 'east', date: '2026-10-10', start_time: '13:00', end_time: '13:30' },
]

describe('LIVE event slot selection', () => {
  it('binds a LIVE to the currently active performance', () => {
    expect(selectLiveEventSlot(slots, '2026-10-10', '13:10')?.id).toBe('round-2')
  })

  it('uses the next performance when a performer starts shortly before it', () => {
    expect(selectLiveEventSlot(slots, '2026-10-10', '12:45')?.id).toBe('round-2')
  })

  it('falls back deterministically when there is no slot today', () => {
    expect(selectLiveEventSlot(slots, '2026-10-11', '10:00')?.id).toBe('round-1')
    expect(selectLiveEventSlot([], '2026-10-10', '10:00')).toBeNull()
  })
})
