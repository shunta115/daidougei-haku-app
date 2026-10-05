// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from '../src/platform/components/InstallPrompt'

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

function prepare({ standalone = false, userAgent = iphoneSafari }: { standalone?: boolean; userAgent?: string } = {}) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent })
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: standalone })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: standalone, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  })
  Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'ja-JP' })
  Object.defineProperty(window.navigator, 'languages', { configurable: true, value: ['ja-JP'] })
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key === 'daidougei-lang' ? 'ja' : null)),
      setItem: vi.fn(),
    },
  })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

describe('iPhone home screen install guidance', () => {
  afterEach(() => {
    cleanup()
    document.body.classList.remove('pl-install-guide-open')
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    vi.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'userAgent')
    Reflect.deleteProperty(window.navigator, 'standalone')
    Reflect.deleteProperty(window.navigator, 'language')
    Reflect.deleteProperty(window.navigator, 'languages')
    Reflect.deleteProperty(window, 'matchMedia')
    Reflect.deleteProperty(window, 'localStorage')
  })

  it('shows the short CTA and the three Safari steps on iPhone', () => {
    prepare()
    render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加する' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /HAKUを/ })).toBeTruthy()
    expect(screen.getByText('共有ボタンを押す')).toBeTruthy()
    expect(screen.getByText('「ホーム画面に追加」を選ぶ')).toBeTruthy()
    expect(screen.getByText('「追加」を押して完了！')).toBeTruthy()
    expect(screen.getByText('まずはここ ↓')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'まずは下の共有ボタンへ' })).toBeTruthy()
  })

  it('dims bottom navigation only while the guide is open', () => {
    prepare()
    render(<InstallPrompt />)
    expect(document.body.classList.contains('pl-install-guide-open')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加する' }))
    expect(document.body.classList.contains('pl-install-guide-open')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: '閉じる' }).at(-1) as HTMLElement)
    expect(document.body.classList.contains('pl-install-guide-open')).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show the guidance when already running standalone', () => {
    prepare({ standalone: true })
    render(<InstallPrompt />)
    expect(screen.queryByText('HAKUをホーム画面に追加')).toBeNull()
  })

  it('keeps the native install prompt on Android and skips the Safari steps', async () => {
    prepare({ userAgent: androidChrome })
    const prompt = vi.fn().mockResolvedValue(undefined)
    render(<InstallPrompt />)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(event)
    fireEvent.click(await screen.findByRole('button', { name: 'HAKUをインストール' }))
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('共有ボタンを押す')).toBeNull()
  })
})
