// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LangProvider } from '../src/i18n/LangProvider'
import { SplashScreen } from '../src/platform/screens/SplashScreen'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('title screen video', () => {
  it('shows the autoplay video layer immediately and enables sound from a user gesture', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    const { container } = render(<LangProvider><SplashScreen onStart={vi.fn()} /></LangProvider>)
    expect(container.querySelector('.pl-splash__stage--on')).toBeTruthy()
    const firstVideo = container.querySelector('video') as HTMLVideoElement
    expect(firstVideo.autoplay).toBe(true)
    expect(firstVideo.muted).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '音声をオンにする' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: '音声をオフにする' })).toBeTruthy()
  })
})
