// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))
import { trackProductEvent } from '../src/platform/lib/track'
import { useTipConfirmation } from '../src/platform/lib/useTipConfirmation'
let sequence = 0
let sessionId: string
const fetchMock = vi.fn()
function reply(body: object, ok = true) { return { ok, json: async () => body } }
beforeEach(() => {
  vi.clearAllMocks()
  const storage = new JSDOM('', { url: 'http://localhost' }).window.sessionStorage
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage })
  sessionId = `cs_test_${'a'.repeat(20)}${++sequence}`
  window.history.replaceState({}, '', `/live?tip=success&session_id=${sessionId}&performerId=forged`)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('verified tip return', () => {
  it.each(['?tip=success', '?tip=success&session_id=fake'])('manual success URL %s cannot display success or emit completion', async (query) => {
    window.history.replaceState({}, '', '/live' + query)
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.message).toBe('tipUnconfirmed'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
  it('waits for the receipt and uses only the verified performer, without login headers', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise(r => { resolve = r }))
    const { result } = renderHook(useTipConfirmation)
    expect(result.current.message).toBe('tipConfirming')
    expect(trackProductEvent).not.toHaveBeenCalled()
    await act(async () => resolve(reply({ ok: true, status: 'paid', performerId: 'verified' })))
    expect(result.current.message).toBe('tipSuccess')
    expect(result.current.performerId).toBe('verified')
    expect(trackProductEvent).toHaveBeenCalledExactlyOnceWith('tip_complete', { performerId: 'verified' })
    expect(fetchMock).toHaveBeenCalledWith('/api/stripe/confirm', expect.objectContaining({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }))
    expect(window.sessionStorage.getItem('pl-tip-confirm')).toBeNull()
  })
  it('polls a delayed webhook and confirms only after it succeeds', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(reply({ ok: false, status: 'pending' })).mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const { result } = renderHook(useTipConfirmation)
    await act(async () => {})
    expect(trackProductEvent).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(result.current.message).toBe('tipSuccess')
    expect(trackProductEvent).toHaveBeenCalledTimes(1)
  })
  it('bounds polling for unpaid/unknown sessions and retains a safe retry', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(reply({ ok: false, status: 'pending' }))
    const { result } = renderHook(useTipConfirmation)
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(result.current.message).toBe('tipConfirmationPending')
    expect(result.current.canRetry).toBe(true)
    expect(trackProductEvent).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('pl-tip-confirm')).toBe(sessionId)
  })
  it('never confirms expired or failed payments', async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, status: 'unconfirmed' }))
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.message).toBe('tipUnconfirmed'))
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
  it.each([reply({ ok: true, status: 'pending', performerId: 'forged' }), reply({ ok: true, status: 'paid' }), reply({ ok: true }, false)])('fails closed on bad API responses', async response => {
    fetchMock.mockResolvedValue(response)
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.message).toBe('tipConfirmationError'))
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
  it('can retry network failures without starting a second payment', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.canRetry).toBe(true))
    expect(trackProductEvent).not.toHaveBeenCalled()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.message).toBe('tipSuccess'))
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/stripe/confirm')).toBe(true)
  })
  it('deduplicates completion under StrictMode and repeated success URLs', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const first = renderHook(useTipConfirmation, { wrapper: StrictMode })
    await waitFor(() => expect(first.result.current.message).toBe('tipSuccess'))
    first.unmount()
    const second = renderHook(useTipConfirmation)
    await waitFor(() => expect(second.result.current.message).toBe('tipSuccess'))
    expect(trackProductEvent).toHaveBeenCalledTimes(1)
  })
  it('resumes confirmation after reload without trusting stored completion', async () => {
    window.history.replaceState({}, '', '/live')
    window.sessionStorage.setItem('pl-tip-confirm', sessionId)
    fetchMock.mockResolvedValue(reply({ ok: false, status: 'unconfirmed' }))
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.message).toBe('tipUnconfirmed'))
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
  it('aborts an in-flight check on unmount without late success or analytics', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise(r => { resolve = r }))
    const { unmount } = renderHook(useTipConfirmation)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(reply({ ok: true, status: 'paid', performerId: 'verified' })))
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
})
