import { describe, expect, it } from 'vitest'
import { parseYouTubeLiveReference, youtubeEmbedUrl, youtubePlayerErrorMessage } from '../src/platform/lib/youtubeLive'

describe('YouTube LIVE companion', () => {
  it('accepts official watch, live, embed and youtu.be URLs', () => {
    for (const value of [
      'abcdefghijk',
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://youtube.com/live/abcdefghijk?feature=share',
      'https://www.youtube.com/embed/abcdefghijk',
      'https://youtu.be/abcdefghijk?t=12',
    ]) {
      expect(parseYouTubeLiveReference(value)).toEqual({
        videoId: 'abcdefghijk',
        canonicalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      })
    }
  })

  it('rejects non-YouTube hosts, channel URLs, insecure URLs and malformed IDs', () => {
    for (const value of [
      'https://evil.example/watch?v=abcdefghijk',
      'https://www.youtube.com/@performer/live',
      'http://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/watch?v=short',
      'javascript:alert(1)',
    ]) expect(parseYouTubeLiveReference(value)).toBeNull()
  })

  it('uses the privacy-enhanced official player with mobile inline playback', () => {
    const url = new URL(youtubeEmbedUrl('abcdefghijk', 'https://haku.example'))
    expect(url.origin).toBe('https://www.youtube-nocookie.com')
    expect(url.pathname).toBe('/embed/abcdefghijk')
    expect(url.searchParams.get('playsinline')).toBe('1')
    expect(url.searchParams.get('enablejsapi')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('https://haku.example')
  })

  it('distinguishes embedding refusal and unavailable videos', () => {
    expect(youtubePlayerErrorMessage(150)).toContain('埋め込み')
    expect(youtubePlayerErrorMessage(100)).toContain('終了・非公開・削除')
  })
})
