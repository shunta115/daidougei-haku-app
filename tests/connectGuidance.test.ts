import { describe, expect, it } from 'vitest'
import { classifyConnectGuidance } from '../src/platform/lib/connectGuidance'

describe('Stripe Connect user guidance', () => {
  it('never calls a failed status fetch a Stripe restriction', () => {
    expect(classifyConnectGuidance(null, true)).toBe('status_unavailable')
  })
  it('distinguishes expired links from normal incomplete onboarding', () => {
    expect(classifyConnectGuidance({ connected: true, complete: false }, false, true)).toBe('expired_link')
  })
  it('recognizes completed transfer readiness', () => {
    expect(classifyConnectGuidance({ connected: true, complete: true }, false)).toBe('ready')
  })
  it('recognizes account mismatch requiring support', () => {
    expect(classifyConnectGuidance({ connected: false, complete: false, state: 'account_mismatch' }, false)).toBe('account_mismatch')
  })
  it('prioritizes an unavailable status over stale restriction and ready flags', () => {
    expect(classifyConnectGuidance({ connected: true, complete: true, state: 'restricted' }, true)).toBe('status_unavailable')
  })
  it('clears expired-link guidance when a fresh status is ready', () => {
    expect(classifyConnectGuidance({ connected: true, complete: true }, false, true)).toBe('ready')
  })
  it('does not confuse unregistered performers with a restriction', () => {
    expect(classifyConnectGuidance({ connected: false, complete: false, state: 'not_started' }, false)).toBe('not_started')
  })
  it('distinguishes review, information required and restrictions', () => {
    expect(classifyConnectGuidance({ connected: true, complete: false, state: 'restricted' }, false)).toBe('restricted')
    expect(classifyConnectGuidance({ connected: true, complete: false, needsInformation: true }, false)).toBe('needs_information')
    expect(classifyConnectGuidance({ connected: true, complete: false, underReview: true }, false)).toBe('under_review')
  })
})
