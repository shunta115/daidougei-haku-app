// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { liveLandingUrl, shareLiveUrl } from '../src/platform/lib/liveShare'
afterEach(() => vi.unstubAllGlobals())
it('builds a direct performer and session URL without inheriting auth/payment parameters', () => {
 const url = new URL(liveLandingUrl('https://haku.example', 'performer 1', '2026-10-31T00:00:00Z'))
 expect(url.searchParams.get('watch')).toBe('performer 1'); expect(url.searchParams.get('liveStartedAt')).toBe('2026-10-31T00:00:00Z')
 expect([...url.searchParams.keys()]).toEqual(['watch','liveStartedAt'])
})
it('calls native sharing synchronously from the tap; cancellation does not copy', async () => {
 const share = vi.fn().mockRejectedValue({ name:'AbortError' }); const writeText = vi.fn()
 vi.stubGlobal('navigator', { share, clipboard:{writeText} })
 const result = shareLiveUrl('https://haku.example/?watch=p','LIVE')
 expect(share).toHaveBeenCalledOnce(); expect(await result).toBe('cancelled'); expect(writeText).not.toHaveBeenCalled()
})
it.each([undefined, vi.fn().mockRejectedValue({name:'NotAllowedError'})])('copies for unsupported or failed sharing', async share => {
 const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { share, clipboard:{writeText} })
 expect(await shareLiveUrl('https://haku.example/?watch=p','LIVE')).toBe('copied'); expect(writeText).toHaveBeenCalledWith('https://haku.example/?watch=p')
})
