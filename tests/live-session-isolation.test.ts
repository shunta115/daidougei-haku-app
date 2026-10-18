import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('LIVE session isolation', () => {
  it('loads, posts and subscribes to comments within the current session only', () => {
    const api = read('src/platform/lib/api.ts')
    const viewer = read('src/platform/screens/LiveWatchScreen.tsx')
    const host = read('src/platform/screens/PerformerLiveScreen.tsx')
    expect(api).toMatch(/listLiveComments\(performerId: string, liveSessionId: string\)[\s\S]*?\.eq\('live_session_id', liveSessionId\)/)
    expect(api).toContain('row.live_session_id === liveSessionId')
    expect(viewer).toContain('liveSessionId,')
    expect(host).toContain('const sessionId = await startLive')
  })

  it('deduplicates realtime comments and isolates verified gift events', () => {
    const viewer = read('src/platform/screens/LiveWatchScreen.tsx')
    const host = read('src/platform/screens/PerformerLiveScreen.tsx')
    const gifts = read('src/platform/components/TipGiftOverlay.tsx')
    expect(viewer).toContain('prev.some((comment) => comment.id === row.id)')
    expect(host).toContain('prev.some((comment) => comment.id === row.id)')
    expect(gifts).toContain('row.live_session_id !== liveSessionId')
    expect(gifts).toContain('subscribeLiveTipEvents(performerId, liveSessionId, enqueue)')
  })

  it('keeps failed drafts and exposes an obvious free applause control', () => {
    const viewer = read('src/platform/screens/LiveWatchScreen.tsx')
    expect(viewer).toContain('👏</span> タップして拍手！')
    expect(viewer).toMatch(/await postLiveComment\([\s\S]*?setDraft\(''\)[\s\S]*?catch/)
    expect(read('src/platform/lib/useVisualKeyboardInset.ts')).toContain('window.visualViewport')
  })
})
