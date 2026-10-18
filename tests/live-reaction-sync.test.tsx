// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ listeners: new Set<any>(), total: 7,
  add: vi.fn(), publish: vi.fn(), hydrate: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  getLiveReactionTotal: (...args: unknown[]) => transport.hydrate(...args),
  addLiveReactions: (...args: unknown[]) => transport.add(...args),
  subscribeLiveReactions: (_id: string, handlers: any) => {
    transport.listeners.add(handlers)
    return { publish: (pulse: any) => transport.publish(pulse), unsubscribe: () => transport.listeners.delete(handlers) }
  },
}))
vi.mock('../src/platform/lib/haptics', () => ({ triggerLightHaptic: vi.fn() }))
import { useLiveReactions } from '../src/platform/lib/useLiveReactions'

const epoch = '2026-10-11T01:00:00Z'
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.useFakeTimers(); vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }); transport.listeners.clear(); transport.total = 7
  transport.hydrate.mockReset().mockResolvedValue(7)
  transport.add.mockReset().mockImplementation(async (_p, _a, count) => {
    transport.total += count
    transport.listeners.forEach(listener => listener.onTotal(transport.total))
    return transport.total
  })
  transport.publish.mockReset().mockImplementation(async pulse => {
    transport.listeners.forEach(listener => listener.onPulse(pulse)); return 'ok'
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('isolated LIVE multi-client reaction flow', () => {
  it('batches guest applause and hearts and synchronizes two viewers and a host without reconnecting', async () => {
    const a = renderHook(() => useLiveReactions('performer', epoch, true, { id: 'guest-a' }))
    const b = renderHook(() => useLiveReactions('performer', epoch, true, { id: 'guest-b' }))
    const host = renderHook(() => useLiveReactions('performer', epoch, true, { id: 'host' }))
    await act(async () => {})
    act(() => { for (let n = 0; n < 3; n++) a.result.current.send('applause'); a.result.current.send('heart') })
    expect(transport.add).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(transport.add).toHaveBeenCalledExactlyOnceWith('performer', 'guest-a', 3, epoch)
    for (const client of [a, b, host]) expect(client.result.current.total).toBe(10)
    expect(host.result.current.pulses.some(pulse => pulse.kind === 'heart')).toBe(true)
    expect(b.result.current.pulses.some(pulse => pulse.kind === 'applause')).toBe(true)
    expect(transport.listeners.size).toBe(3)
  })
  it('caps repeated taps, restores authoritative total on reconnect and discards previous session batches', async () => {
    const client = renderHook(({ session }) => useLiveReactions('performer', session, true), { initialProps: { session: epoch } })
    await act(async () => {})
    act(() => { for (let n = 0; n < 100; n++) client.result.current.send('applause') })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(transport.add.mock.calls[0][2]).toBe(12)
    transport.hydrate.mockResolvedValue(30)
    await act(async () => { transport.listeners.forEach(listener => listener.onReady()) })
    expect(client.result.current.total).toBe(30)
    act(() => { client.result.current.send('applause') })
    transport.hydrate.mockResolvedValue(0)
    client.rerender({ session: '2026-10-12T01:00:00Z' })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(client.result.current.total).toBe(0)
    expect(transport.add).toHaveBeenCalledTimes(1)
  })
  it('shows failed delivery and cleans listeners and timers', async () => {
    transport.publish.mockResolvedValue('timed out')
    const client = renderHook(() => useLiveReactions('performer', epoch, true))
    act(() => { client.result.current.send('applause') })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(client.result.current.deliveryError).toContain('送信できませんでした')
    client.unmount()
    expect(transport.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
