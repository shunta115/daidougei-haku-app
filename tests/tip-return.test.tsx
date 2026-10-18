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
const reply = (body: object, ok = true) => ({ ok, json: async () => body })

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
  it.each(['?tip=success', '?tip=success&session_id=fake'])('manual URL %s cannot display success', async (query) => {
    window.history.replaceState({}, '', '/live' + query)
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.message).toBe('tipUnconfirmed'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('waits for the webhook-backed receipt and uses its performer', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const { result } = renderHook(useTipConfirmation)
    expect(result.current.message).toBe('tipConfirming')
    await act(async () => resolve(reply({ ok: true, status: 'paid', performerId: 'verified' })))
    expect(result.current.message).toBe('tipSuccess')
    expect(result.current.performerId).toBe('verified')
    expect(trackProductEvent).toHaveBeenCalledExactlyOnceWith('tip_complete', { performerId: 'verified' })
  })

  it('polls delayed webhook completion', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(reply({ ok: false, status: 'pending' })).mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const { result } = renderHook(useTipConfirmation)
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(result.current.message).toBe('tipSuccess')
  })

  it('retains a safe retry without starting a second payment', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const { result } = renderHook(useTipConfirmation)
    await waitFor(() => expect(result.current.canRetry).toBe(true))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.message).toBe('tipSuccess'))
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/stripe/confirm')).toBe(true)
  })

  it('deduplicates completion in StrictMode', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, status: 'paid', performerId: 'verified' }))
    const first = renderHook(useTipConfirmation, { wrapper: StrictMode })
    await waitFor(() => expect(first.result.current.message).toBe('tipSuccess'))
    first.unmount()
    const second = renderHook(useTipConfirmation)
    await waitFor(() => expect(second.result.current.message).toBe('tipSuccess'))
    expect(trackProductEvent).toHaveBeenCalledTimes(1)
  })
})
