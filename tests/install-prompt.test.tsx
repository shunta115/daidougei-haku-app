// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from '../src/platform/components/InstallPrompt'

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

function prepare({ standalone = false }: { standalone?: boolean } = {}) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: iphoneSafari })
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: standalone })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: standalone, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  })
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: vi.fn(() => null), setItem: vi.fn() },
  })
}

describe('iPhone home screen install guidance', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'userAgent')
    Reflect.deleteProperty(window.navigator, 'standalone')
    Reflect.deleteProperty(window, 'matchMedia')
    Reflect.deleteProperty(window, 'localStorage')
  })

  it('shows the short CTA and the three Safari steps on iPhone', () => {
    prepare()
    render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(screen.getByRole('dialog', { name: '大道芸博をアプリにする' })).toBeTruthy()
    expect(screen.getByText('Safariの共有を押す')).toBeTruthy()
    expect(screen.getByText('「ホーム画面に追加」')).toBeTruthy()
    expect(screen.getByText('右上の「追加」')).toBeTruthy()
  })

  it('does not show the guidance when already running standalone', () => {
    prepare({ standalone: true })
    render(<InstallPrompt />)
    expect(screen.queryByText('大道芸博をアプリにする')).toBeNull()
  })
})
