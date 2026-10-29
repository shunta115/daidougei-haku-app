import { describe, expect, it } from 'vitest'
import { appearanceDates } from '../src/platform/lib/appearanceRegistration'

describe('appearance registration dates', () => {
  it('normalizes multiple mobile-friendly date separators and removes duplicates', () => {
    expect(appearanceDates('2026-11-01', '2026-11-02, 2026-11-03、2026-11-02')).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03',
    ])
  })

  it('ignores malformed dates before the database request', () => {
    expect(appearanceDates('2026-11-01', 'tomorrow 2026/11/02')).toEqual(['2026-11-01'])
  })
})
