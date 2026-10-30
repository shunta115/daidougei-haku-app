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


it('removes the copy field and restores focus even when legacy copy throws', async () => {
  vi.stubGlobal('navigator', {})
  const button = document.createElement('button')
  document.body.append(button)
  button.focus()
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { throw new Error('copy failed') } })
  await expect(copyAppearanceUrl('https://haku.example')).rejects.toThrow('copy failed')
  expect(document.querySelector('input')).toBeNull()
  expect(document.activeElement).toBe(button)
  button.remove()
})

it('recognizes cancellation across realms without copying', async () => {
  const copy = vi.fn()
  vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue({ name: 'AbortError' }), clipboard: { writeText: copy } })
  expect(await shareAppearance('https://haku.example', 'HAKU')).toBe('cancelled')
  expect(copy).not.toHaveBeenCalled()
})

it('falls back to copying after a native share permission failure', async () => {
  const copy = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('denied')), clipboard: { writeText: copy } })
  expect(await shareAppearance('https://haku.example', 'HAKU')).toBe('copied')
  expect(copy).toHaveBeenCalledWith('https://haku.example')
})
