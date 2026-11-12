import { describe, expect, it } from 'vitest'
import { MULTI_LIVE_CAPABILITIES, validateYouTubeIngestUrl } from '../src/platform/lib/multiLive'

describe('Multi LIVE foundation', () => {
  it('requires official permissions for TikTok interactivity', () => {
    const tiktok = MULTI_LIVE_CAPABILITIES.find((item) => item.provider === 'tiktok')
    expect(tiktok?.video).toBe('conditional')
    expect(tiktok?.comments).toBe('conditional')
    expect(tiktok?.gifts).toBe('conditional')
  })
  it('accepts a valid YouTube secure ingest URL', () => {
    expect(validateYouTubeIngestUrl('rtmps://a.rtmps.youtube.com/live2/example-key')).toBe(true)
  })
  it.each([
    'http://a.rtmps.youtube.com/live2/key',
    'rtmp://a.rtmps.youtube.com/live2/key',
    'rtmps://a.rtmps.youtube.com.evil.com/live2/key',
    'rtmps://user:pass@a.rtmps.youtube.com/live2/key',
    'rtmps://a.rtmps.youtube.com/live2/key?token=1',
    'rtmps://a.rtmps.youtube.com/other/key',
    'not-a-url',
  ])('rejects unsafe or invalid ingest destination: %s', (url) => {
    expect(validateYouTubeIngestUrl(url)).toBe(false)
  })
})
