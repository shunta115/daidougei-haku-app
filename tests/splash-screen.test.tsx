// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LangProvider } from '../src/i18n/LangProvider'
import { resolveOfficialSiteUrl, SplashScreen } from '../src/platform/screens/SplashScreen'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === 'daidougei-lang' ? 'ja' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 1,
  })
})

describe('title screen video', () => {
  it('falls back to muted autoplay and enables sound from a user gesture', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new DOMException('NotAllowedError'))
      .mockResolvedValue(undefined)

    const { container } = render(<LangProvider><SplashScreen onStart={vi.fn()} /></LangProvider>)
    expect(container.querySelector('.pl-splash__stage--on')).toBeTruthy()
    const firstVideo = container.querySelector('video') as HTMLVideoElement
    expect(firstVideo.autoplay).toBe(true)
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(firstVideo.muted).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '音声をオンにする' }))
    expect(play).toHaveBeenCalledTimes(3)
    expect(await screen.findByRole('button', { name: '音声をオフにする' })).toBeTruthy()
  })

  it('keeps audio on when sound autoplay is permitted', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = render(<LangProvider><SplashScreen onStart={vi.fn()} /></LangProvider>)
    await waitFor(() => expect(play).toHaveBeenCalled())
    expect((container.querySelector('video') as HTMLVideoElement).muted).toBe(false)
    expect(screen.getByRole('button', { name: '音声をオフにする' })).toBeTruthy()
  })

  it('hides an unset or unsafe official website URL', () => {
    expect(resolveOfficialSiteUrl(undefined)).toBeNull()
    expect(resolveOfficialSiteUrl('javascript:alert(1)')).toBeNull()
    expect(resolveOfficialSiteUrl('https://example.com/haku')).toBe('https://example.com/haku')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('NotAllowedError'))
    render(<LangProvider><SplashScreen onStart={vi.fn()} /></LangProvider>)
    expect(screen.queryByRole('link', { name: /新公式ホームページ/ })).toBeNull()
    expect(screen.getAllByText(/全機能 世界/).length).toBeGreaterThan(0)
    expect(screen.getByText('世界が舞台。')).toBeTruthy()
    expect(screen.getByText('いま、あなたは最前列。')).toBeTruthy()
  })
})
