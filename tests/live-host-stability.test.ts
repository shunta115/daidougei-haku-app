import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('LIVE host stability', () => {
  it('captures portrait video at 30fps with a portrait aspect ratio', () => {
    const source = read('src/platform/lib/livekit.ts')
    expect(source).toMatch(/CAPTURE_PORTRAIT_720P30[\s\S]*width: 720[\s\S]*height: 1280[\s\S]*frameRate: 30[\s\S]*aspectRatio: 9 \/ 16/)
    expect(source).toMatch(/landscape[\s\S]*CAPTURE_1080P30[\s\S]*CAPTURE_PORTRAIT_720P30/)
  })

  it('does not heartbeat a terminally disconnected publisher', () => {
    const source = read('src/platform/screens/PerformerLiveScreen.tsx')
    expect(source).toMatch(/if \(!active \|\| !roomRef\.current\) return/)
    expect(source).toMatch(/RoomEvent\.Disconnected/)
    expect(source).toMatch(/配信へ再接続/)
  })

  it('provides explicit camera and microphone controls', () => {
    const source = read('src/platform/screens/PerformerLiveScreen.tsx')
    expect(source).toMatch(/setCameraEnabled\(next\)/)
    expect(source).toMatch(/setMicrophoneEnabled\(next\)/)
    expect(source).toMatch(/aria-pressed=\{cameraOn\}/)
    expect(source).toMatch(/aria-pressed=\{microphoneOn\}/)
  })

  it('shows realtime applause intensity and the authoritative total', () => {
    const source = read('src/platform/screens/PerformerLiveScreen.tsx')
    expect(source).toContain('useLiveReactions(performer?.id, performer?.live_started_at')
    expect(source).toContain('<LiveApplauseMeter')
    expect(read('src/platform/components/LiveReactionEffects.tsx')).toContain('role="meter"')
    expect(read('src/platform/lib/useLiveReactions.ts')).toContain('Math.max(0, currentLevel - LIVE_REACTION_CONFIG.decay)')
  })
})
