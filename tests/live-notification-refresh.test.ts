// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startNotificationRefresh } from '../src/platform/lib/notificationRefresh'

afterEach(() => vi.useRealTimers())

function environment(initialVisibility: DocumentVisibilityState = 'visible') {
  const windowTarget = new EventTarget()
  const documentTarget = new EventTarget()
  let visibilityState = initialVisibility
  return {
    windowTarget,
    documentTarget,
    setVisibility(next: DocumentVisibilityState) { visibilityState = next },
    value: {
      window: {
        addEventListener: windowTarget.addEventListener.bind(windowTarget),
        removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
        setInterval: window.setInterval.bind(window),
        clearInterval: window.clearInterval.bind(window),
      },
      document: {
        addEventListener: documentTarget.addEventListener.bind(documentTarget),
        removeEventListener: documentTarget.removeEventListener.bind(documentTarget),
        get visibilityState() { return visibilityState },
      },
    },
  }
}

describe('LIVE notification refresh', () => {
  it('loads immediately, polls while visible, and refreshes when the app returns', async () => {
    vi.useFakeTimers()
    const env = environment()
    const load = vi.fn().mockResolvedValue(undefined)
    const stop = startNotificationRefresh(load, 5_000, env.value)

    await vi.runAllTicks()
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(load).toHaveBeenCalledTimes(2)

    env.setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(load).toHaveBeenCalledTimes(2)

    env.setVisibility('visible')
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTicks()
    expect(load).toHaveBeenCalledTimes(3)

    env.windowTarget.dispatchEvent(new Event('online'))
    await vi.runAllTicks()
    expect(load).toHaveBeenCalledTimes(4)
    stop()
  })

  it('coalesces simultaneous wakeups and removes every listener on cleanup', async () => {
    vi.useFakeTimers()
    const env = environment()
    let resolveLoad: (() => void) | undefined
    const load = vi.fn(() => new Promise<void>((resolve) => { resolveLoad = resolve }))
    const stop = startNotificationRefresh(load, 5_000, env.value)

    env.windowTarget.dispatchEvent(new Event('focus'))
    env.windowTarget.dispatchEvent(new Event('online'))
    expect(load).toHaveBeenCalledTimes(1)
    resolveLoad?.()
    await vi.runAllTicks()
    expect(load).toHaveBeenCalledTimes(2)

    stop()
    resolveLoad?.()
    await vi.runAllTicks()
    env.windowTarget.dispatchEvent(new Event('focus'))
    env.windowTarget.dispatchEvent(new Event('online'))
    env.documentTarget.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
