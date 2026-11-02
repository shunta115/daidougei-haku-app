// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createLiveStory } from '../src/platform/lib/liveStory'

afterEach(() => vi.restoreAllMocks())
it.each([true, false, null])('draws the performer and viewing URL with accurate state %s', async live => {
  const fillText = vi.fn()
  const context = { createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(), fillText, measureText: (s: string) => ({ width: s.length * 40 }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect([this.width, this.height]).toEqual([1080, 1920])
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  const result = await createLiveStory({ name: '出演者 HAKU', url: 'https://example.com/live?watch=123', live })
  expect(result.type).toBe('image/png')
  const words = fillText.mock.calls.map(call => call[0]).join('\n')
  expect(words).toContain('出演者 HAKU')
  expect(words).toContain('https://example.com/live?watch=123')
  if (live) expect(words).toContain('LIVE中 · 画像作成時点')
  else expect(words).not.toContain('LIVE中')
})
