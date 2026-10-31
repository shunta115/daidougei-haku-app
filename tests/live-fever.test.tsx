// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const wire = vi.hoisted(() => ({ listeners: new Set<(total: number) => void>(), total: 0, batches: new Map<string, number>(), send: vi.fn(), read: vi.fn(), offline: false, ready: null as null | (() => void), connection: null as null | ((connected: boolean) => void) }))
vi.mock('../src/platform/lib/liveLikes', () => ({
  getLiveLikeTotal: (...args: unknown[]) => wire.read(...args),
  sendLiveLikeBatch: (...args: unknown[]) => wire.send(...args),
  subscribeLiveLikeTotal: (_p: string, _s: string, onTotal: (n: number) => void, onReady: () => void, onConnection: (connected: boolean) => void) => { wire.ready = onReady; wire.connection = onConnection; wire.listeners.add(onTotal); return () => wire.listeners.delete(onTotal) },
}))
import { useLiveFever } from '../src/platform/lib/useLiveFever'
const session = '2026-10-18T01:00:00Z'
beforeEach(() => {
  vi.useFakeTimers(); wire.total = 0; wire.offline = false; wire.batches.clear(); wire.listeners.clear()
  wire.read.mockReset().mockImplementation(async () => wire.total)
  wire.send.mockReset().mockImplementation(async (_p, _s, id, count) => {
    if (!wire.batches.has(id)) { wire.batches.set(id, count); wire.total += count }
    if (wire.offline) throw new Error('lost response after commit')
    wire.listeners.forEach(fn => fn(wire.total)); return wire.total
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('durable LIVE likes across viewers and host', () => {
  it('animates taps immediately, counts only acknowledged totals, and delivers to host and another viewer', async () => {
    const a = renderHook(() => useLiveFever('p', session, true, 'a'))
    const b = renderHook(() => useLiveFever('p', session, true, 'b'))
    const host = renderHook(() => useLiveFever('p', session, true, 'host'))
    await act(async () => {})
    act(() => { for (let i = 0; i < 3; i++) a.result.current.sendLike(); b.result.current.sendLike() })
    expect(a.result.current.hearts.length).toBe(3); expect(a.result.current.likes).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    for (const client of [a,b,host]) { expect(client.result.current.likes).toBe(4); expect(client.result.current.level).toBeGreaterThan(0) }
    expect(host.result.current.hearts.length).toBeGreaterThan(0)
    expect(wire.total).toBe(4)
  })
  it('retries the SAME batch after a committed response is lost; never double counts', async () => {
    const a = renderHook(() => useLiveFever('p', session, true, 'a'))
    await act(async () => {})
    wire.offline = true
    act(() => a.result.current.sendLike())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(a.result.current.deliveryError).toContain('再送待ち')
    wire.offline = false
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(wire.send).toHaveBeenCalledTimes(2)
    expect(wire.send.mock.calls[0]).toEqual(wire.send.mock.calls[1])
    expect(wire.total).toBe(1); expect(a.result.current.likes).toBe(1)
  })
  it('restores totals after missing realtime; bounds taps and keeps verified gift gain', async () => {
    const a = renderHook(() => useLiveFever('p', session, true, 'a'))
    await act(async () => {})
    act(() => { for (let i=0;i<100;i++) a.result.current.sendLike(); a.result.current.addGift('premium') })
    expect(a.result.current.level).toBe(35)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(wire.total).toBe(12)
    wire.total = 40
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(a.result.current.likes).toBe(40)
  })
  it('rejects guest sending and discards queued previous-session likes; cleans resources', async () => {
    const a = renderHook(({ epoch, user }) => useLiveFever('p', epoch, true, user), { initialProps: { epoch: session, user: undefined as string | undefined } })
    act(() => a.result.current.sendLike()); expect(a.result.current.deliveryError).toContain('ログイン')
    a.rerender({ epoch: session, user:'a' }); act(() => a.result.current.sendLike())
    a.rerender({ epoch:'2026-10-18T02:00:00Z', user:'a' })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(wire.send).not.toHaveBeenCalled()
    a.unmount(); expect(wire.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
  it('avoids short-interval reads while Realtime is healthy and resumes immediate recovery on disconnect', async () => {
    const view = renderHook(() => useLiveFever('p', session, true, 'cadence-user'))
    await act(async () => {})
    await act(async () => wire.ready?.())
    const initial = wire.read.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(58_000) })
    expect(wire.read).toHaveBeenCalledTimes(initial)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(wire.read).toHaveBeenCalledTimes(initial + 1)
    wire.total = 123
    await act(async () => wire.connection?.(false))
    expect(view.result.current.likes).toBe(123)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(wire.read).toHaveBeenCalledTimes(initial + 3)
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

})
