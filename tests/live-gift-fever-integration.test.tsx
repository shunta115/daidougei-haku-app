// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tipStream = vi.hoisted(() => ({ onInsert: null as ((row: any) => void) | null, unsubscribe: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  listRecentLiveTipEvents: vi.fn().mockResolvedValue([]),
  subscribeLiveTipEvents: (_performerId: string, onInsert: (row: any) => void) => {
    tipStream.onInsert = onInsert
    return tipStream.unsubscribe
  },
}))
import { TipGiftOverlay } from '../src/platform/components/TipGiftOverlay'

const gift = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1', tip_id: 'tip-1', performer_id: 'performer-1', live_session_id: 'session-1',
  fan_id: 'fan-1', display_name: '応援ファン', avatar_url: null, amount_cents: 1000,
  gift_label: '投げ銭', is_anonymous: false, tier: 'normal', created_at: '2026-10-18T01:00:00Z',
  ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers()
  tipStream.onInsert = null
  tipStream.unsubscribe.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('verified gift to HAKU FEVER integration', () => {
  it('shows THANK YOU and raises FEVER once for each verified gift', () => {
    const onGift = vi.fn()
    render(<TipGiftOverlay performerId="performer-1" soundEnabled={false} reducedMotion onGift={onGift} />)
    act(() => tipStream.onInsert?.(gift()))
    expect(screen.getByText('THANK YOU!')).toBeTruthy()
    expect(onGift).toHaveBeenCalledExactlyOnceWith('normal')

    act(() => tipStream.onInsert?.(gift()))
    expect(onGift).toHaveBeenCalledTimes(1)
    act(() => tipStream.onInsert?.(gift({ id: 'foreign', tip_id: 'foreign-tip', performer_id: 'other' })))
    expect(onGift).toHaveBeenCalledTimes(1)
  })

  it('cleans queued presentation timers and the Realtime subscription', () => {
    const onGift = vi.fn()
    const view = render(<TipGiftOverlay performerId="performer-1" soundEnabled={false} reducedMotion onGift={onGift} />)
    act(() => {
      tipStream.onInsert?.(gift())
      tipStream.onInsert?.(gift({ id: 'event-2', tip_id: 'tip-2', tier: 'premium' }))
    })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    view.unmount()
    expect(tipStream.unsubscribe).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
