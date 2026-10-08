import { expect, it } from 'vitest'
import { fromVotingDateTimeInput, toVotingDateTimeInput } from '../src/platform/lib/votingDateTime'

it.each([
  ['2026-10-10T03:00:00Z', '2026-10-10T12:00'],
  ['2026-10-12T09:30:00+00:00', '2026-10-12T18:30'],
  ['2026-10-10T12:00:00+09:00', '2026-10-10T12:00'],
  ['2026-10-09T15:00:00Z', '2026-10-10T00:00'],
  ['2026-12-31T15:00:00Z', '2027-01-01T00:00'],
  ['2026-03-08T17:30:00Z', '2026-03-09T02:30'],
])('round-trips %s through JST input %s', (stored, displayed) => {
  expect(toVotingDateTimeInput(stored)).toBe(displayed)
  const saved = fromVotingDateTimeInput(displayed)
  expect(saved).toBe(new Date(stored).toISOString())
  expect(toVotingDateTimeInput(saved)).toBe(displayed)
})

it('supports unset bounds and rejects malformed or impossible input', () => {
  expect(toVotingDateTimeInput(null)).toBe('')
  expect(toVotingDateTimeInput(undefined)).toBe('')
  expect(fromVotingDateTimeInput('')).toBeNull()
  for (const value of ['invalid', '2026-02-30T12:00', '2026-10-10T24:00']) {
    expect(() => fromVotingDateTimeInput(value)).toThrow()
  }
})
