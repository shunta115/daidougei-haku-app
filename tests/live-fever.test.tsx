// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ listeners: new Set<(pulse: any) => void>(), publish: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  subscribeLiveFever: (_performerId: string, _startedAt: string, onPulse: (pulse: any) => void) => {
    transport.listeners.add(onPulse)
    return {
      publish: (pulse: any) => transport.publish(pulse),
      unsubscribe: () => { transport.listeners.delete(onPulse); transport.unsubscribe() },
    }
  },
}))
import { useLiveFever } from '../src/platform/lib/useLiveFever'

const session = '2026-10-18T01:00:00Z'

beforeEach(() => {
  vi.useFakeTimers()
  // Each hook represents a separate device, so each receives its own actor id.
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  transport.listeners.clear()
  transport.publish.mockReset().mockImplementation(async (pulse) => {
    transport.listeners.forEach((listener) => listener(pulse))
    return 'ok'
  })
  transport.unsubscribe.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HAKU FEVER', () => {
  it('shows local likes immediately and synchronizes a bounded batch to another viewer', async () => {
    const viewer = renderHook(() => useLiveFever('performer', session, true))
    const host = renderHook(() => useLiveFever('performer', session, true))
    act(() => { for (let count = 0; count < 3; count += 1) viewer.result.current.sendLike() })
    expect(viewer.result.current.likes).toBe(3)
    expect(viewer.result.current.level).toBe(12)
    expect(transport.publish).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(transport.publish).toHaveBeenCalledTimes(1)
    expect(transport.publish.mock.calls[0][0]).toMatchObject({ count: 3, liveStartedAt: session })
    expect(host.result.current.likes).toBe(3)
    expect(host.result.current.hearts.length).toBe(3)
  })

  it('caps rapid likes and adds verified gift tiers to the fever level', () => {
    const viewer = renderHook(() => useLiveFever('performer', session, true))
    act(() => { for (let count = 0; count < 100; count += 1) viewer.result.current.sendLike() })
    expect(viewer.result.current.likes).toBe(12)
    act(() => viewer.result.current.addGift('premium'))
    expect(viewer.result.current.level).toBe(83)
  })

  it('resets between LIVE sessions and cleans its transport and timers', () => {
    const viewer = renderHook(({ startedAt }) => useLiveFever('performer', startedAt, true), { initialProps: { startedAt: session } })
    act(() => viewer.result.current.sendLike())
    expect(viewer.result.current.likes).toBe(1)
    viewer.rerender({ startedAt: '2026-10-18T02:00:00Z' })
    expect(viewer.result.current.likes).toBe(0)
    viewer.unmount()
    expect(transport.listeners.size).toBe(0)
    expect(transport.unsubscribe).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
