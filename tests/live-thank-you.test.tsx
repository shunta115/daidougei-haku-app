import { describe, expect, it } from 'vitest'
import { thankYouMessage } from '../src/platform/components/TipGiftOverlay'

describe('LIVE THANK YOU presentation', () => {
  it.each([
    ['normal', 'THANK YOU!'],
    ['premium', 'BIG THANK YOU!'],
    ['special', 'SPECIAL THANK YOU!'],
  ] as const)('maps the %s gift tier to a stable message', (tier, expected) => {
    expect(thankYouMessage(tier)).toBe(expected)
  })
})
