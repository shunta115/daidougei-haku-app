import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLiveFeverPulse } from '../src/platform/lib/liveFever'

const read = (path: string) => readFileSync(path, 'utf8')

describe('HAKU FEVER safety', () => {
  it('rejects malformed and oversized broadcast payloads', () => {
    expect(isLiveFeverPulse({ actorId: 'a', nonce: 'n', count: 12, liveStartedAt: '2026-10-18T01:00:00Z' })).toBe(true)
    expect(isLiveFeverPulse({ actorId: 'a', nonce: 'n', count: 13, liveStartedAt: '2026-10-18T01:00:00Z' })).toBe(false)
    expect(isLiveFeverPulse({ actorId: 'a', nonce: 'n', count: 1, liveStartedAt: 'invalid' })).toBe(false)
  })

  it('uses existing verified gift events without changing payment or database code', () => {
    const gift = read('src/platform/components/TipGiftOverlay.tsx')
    const api = read('src/platform/lib/api.ts')
    expect(gift).toContain('onGiftRef.current?.(next.tier)')
    expect(api).toContain(".channel(`live-fever-${performerId}`)")
    expect(api).not.toContain("from('live_reaction_totals')")
    expect(read('src/platform/screens/LiveWatchScreen.tsx')).toContain('onGift={fever.addGift}')
    expect(read('src/platform/screens/PerformerLiveScreen.tsx')).toContain('onGift={fever.addGift}')
  })
})
