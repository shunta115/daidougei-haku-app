import { describe, expect, it } from 'vitest'
import { buildFinalistAssignments } from '../src/platform/lib/finalistAssignments'

describe('AWP SPECIAL NIGHT finalist assignments', () => {
  it('assigns the same top three to rank slots on all three event dates', () => {
    const slots = ['10', '11', '12'].flatMap((date) => [1, 2, 3].map((rank) => ({
      id: `${date}-${rank}`,
      performance_type: 'special_final' as const,
      ranking_position: rank,
    })))
    const ranking = [
      { performer_id: 'first' },
      { performer_id: 'second' },
      { performer_id: 'third' },
    ]

    const assignments = buildFinalistAssignments(slots, ranking)
    expect(assignments).toHaveLength(9)
    expect(assignments?.map(({ performerId }) => performerId)).toEqual([
      'first', 'second', 'third',
      'first', 'second', 'third',
      'first', 'second', 'third',
    ])
  })

  it('fails closed if a SPECIAL NIGHT slot has no valid ranking position', () => {
    const slots = [
      { id: 'one', performance_type: 'special_final' as const, ranking_position: 1 },
      { id: 'two', performance_type: 'special_final' as const, ranking_position: 2 },
      { id: 'unknown', performance_type: 'special_final' as const, ranking_position: null },
    ]
    expect(buildFinalistAssignments(slots, [
      { performer_id: 'first' }, { performer_id: 'second' }, { performer_id: 'third' },
    ])).toBeNull()
  })
})
