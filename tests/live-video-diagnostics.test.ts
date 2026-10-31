// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room } from 'livekit-client'
import { readHostVideoDiagnostics } from '../src/platform/lib/liveVideoDiagnostics'

const state = vi.hoisted(() => ({ track: undefined as unknown }))
vi.mock('../src/platform/lib/liveCamera', () => ({ hostCameraTrack: () => state.track }))

function fixture(processed = true) {
  const source = { width: 1280, height: 960, aspectRatio: 4 / 3, facingMode: 'environment', frameRate: 30, zoom: 1, deviceId: 'private-device', groupId: 'private-group' }
  const input = processed ? { width: 720, height: 1280, aspectRatio: 9 / 16, frameRate: 30, deviceId: 'canvas-device' } : source
  const track = {
    getSourceTrackSettings: vi.fn(() => source),
    mediaStreamTrack: {
      getSettings: vi.fn(() => input),
      getCapabilities: vi.fn(() => ({ width: { min: 320, max: 1920 }, height: { min: 240, max: 1080 }, zoom: { min: 1, max: 5, step: 0.1 }, deviceId: 'private-device' })),
    },
    getProcessor: vi.fn(() => processed ? { processedTrack: {} } : undefined),
    getSenderStats: vi.fn().mockResolvedValue([{ frameWidth: 720, frameHeight: 1280, framesPerSecond: 24, targetBitrate: 1_000_000, qualityLimitationReason: 'bandwidth', streamId: 'private-stream', rid: 'private-rid', timestamp: 1000, bytesSent: 1000 }]),
  }
  state.track = track
  return track
}

beforeEach(() => { state.track = undefined })

describe('read-only LIVE video diagnostics', () => {
  it('distinguishes the actual camera from the processor output and excludes identifiers', async () => {
    const track = fixture()
    const report = await readHostVideoDiagnostics({} as Room, null)
    expect(report.source).toMatchObject({ width: 1280, height: 960, facingMode: 'environment', zoom: 1 })
    expect(report.senderInput).toMatchObject({ width: 720, height: 1280 })
    expect(report.encodedLayers).toEqual([{ width: 720, height: 1280, framesPerSecond: 24, targetBitrateBps: 1_000_000, qualityLimitationReason: 'bandwidth' }])
    expect(report.processorActive).toBe(true)
    expect(report.sourceCapabilities).toBeNull()
    expect(report.warnings).toContain('source_capabilities_unavailable')
    expect(JSON.stringify(report)).not.toMatch(/private-|deviceId|groupId|streamId|rid/)
    expect(track.getSourceTrackSettings).toHaveBeenCalledOnce()
  })

  it('reports numeric capabilities as source capabilities only without a processor', async () => {
    fixture(false)
    const report = await readHostVideoDiagnostics({} as Room, null)
    expect(report.sourceCapabilities?.zoom).toEqual({ min: 1, max: 5, step: 0.1 })
    expect(report.sourceCapabilities).toEqual(report.senderInputCapabilities)
    expect(report.processorActive).toBe(false)
  })

  it('uses matching sender counter samples for measured bitrate and ignores resets', async () => {
    const track = fixture()
    expect((await readHostVideoDiagnostics({} as Room, null)).measuredBitrateBps).toBeNull()
    track.getSenderStats.mockResolvedValueOnce([{ streamId: 'private-stream', rid: 'private-rid', timestamp: 2000, bytesSent: 251000 }])
    expect((await readHostVideoDiagnostics({} as Room, null)).measuredBitrateBps).toBe(2_000_000)
    track.getSenderStats.mockResolvedValueOnce([{ streamId: 'private-stream', rid: 'private-rid', timestamp: 3000, bytesSent: 1 }])
    expect((await readHostVideoDiagnostics({} as Room, null)).measuredBitrateBps).toBeNull()
  })

  it('reads preview dimensions and returns safe warnings when stats are unavailable', async () => {
    const track = fixture()
    track.getSenderStats.mockRejectedValueOnce(new Error('private-token'))
    const video = document.createElement('video')
    video.style.objectFit = 'cover'
    Object.defineProperties(video, { videoWidth: { value: 720 }, videoHeight: { value: 1280 }, clientWidth: { value: 390 }, clientHeight: { value: 844 } })
    const report = await readHostVideoDiagnostics({} as Room, video)
    expect(report.preview).toMatchObject({ width: 720, height: 1280, elementWidth: 390, elementHeight: 844, objectFit: 'cover' })
    expect(report.warnings).toContain('sender_stats_unavailable')
    expect(JSON.stringify(report)).not.toContain('private-token')
    expect((await readHostVideoDiagnostics(null, null)).warnings).toEqual(['camera_unavailable'])
  })
})
