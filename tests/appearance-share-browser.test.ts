// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { appearanceLandingUrl, copyAppearanceUrl, shareAppearance } from '../src/platform/lib/appearanceShare'
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('falls back to Safari selection/copy when Clipboard API permission is denied', async () => {
  const copy = vi.fn(() => true)
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })
  await copyAppearanceUrl('https://haku.example/?profile=p&schedule=a')
  expect(copy).toHaveBeenCalledWith('copy')
  expect(document.querySelector('input')).toBeNull()
})

it('does not copy or report a failure when the user cancels the native share sheet', async () => {
  const copy = vi.fn()
  vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')), clipboard: { writeText: copy } })
  expect(await shareAppearance('https://haku.example/?profile=p', 'Public show')).toBe('cancelled')
  expect(copy).not.toHaveBeenCalled()
})

it('copies the public URL if native sharing is unavailable', async () => {
  const copy = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } })
  expect(await shareAppearance('https://haku.example/?profile=p', 'Public show')).toBe('copied')
  expect(copy).toHaveBeenCalledWith('https://haku.example/?profile=p')
})

it('keeps legacy event slots shareable without linking to a nonexistent appearance detail', () => {
  const url = new URL(appearanceLandingUrl('https://haku.example', 'p', 'event-slot:legacy'))
  expect(url.searchParams.get('profile')).toBe('p')
  expect(url.searchParams.has('schedule')).toBe(false)
})
