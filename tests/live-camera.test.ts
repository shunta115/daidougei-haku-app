import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Track, type Room } from 'livekit-client'
import {
  canSwitchHostCamera,
  naturalZoomForRange,
  PORTRAIT_LIVE_CAPTURE,
  preferNaturalCameraFieldOfView,
  switchHostCamera,
  trackVideoOrientation,
} from '../src/platform/lib/liveCamera'

function fixture(facing: 'user' | 'environment' = 'user', cameraCount = 2, zoom?: number) {
  let settings: MediaTrackSettings & { zoom?: number } = { facingMode: facing, deviceId: facing, width: 720, height: 1280, frameRate: 30, zoom }
  const track = {
    isMuted: false,
    mediaStreamTrack: {
      getSettings: () => settings,
      getCapabilities: vi.fn(() => zoom == null ? {} : { zoom: { min: 1, max: 5, step: 0.1 } }),
      getConstraints: vi.fn(() => ({ width: { ideal: 720 }, height: { ideal: 1280 } })),
      applyConstraints: vi.fn(async (constraints: MediaTrackConstraints) => {
        const width = typeof constraints.width === 'object' ? constraints.width.ideal : constraints.width
        const height = typeof constraints.height === 'object' ? constraints.height.ideal : constraints.height
        const requestedZoom = (constraints.advanced?.at(-1) as MediaTrackConstraintSet & { zoom?: number })?.zoom
        settings = {
          ...settings,
          ...(width && height ? { width: Number(width), height: Number(height), aspectRatio: Number(width) / Number(height) } : {}),
          ...(requestedZoom == null ? {} : { zoom: requestedZoom }),
        }
      }),
    },
    restartTrack: vi.fn(async (options) => {
      settings = {
        ...settings,
        facingMode: options.facingMode,
        deviceId: options.facingMode,
        width: options.resolution?.width,
        height: options.resolution?.height,
        aspectRatio: options.resolution?.aspectRatio,
      }
    }),
  }
  const room = {
    disconnect: vi.fn(),
    localParticipant: {
      getTrackPublication: vi.fn((source) => source === Track.Source.Camera ? { track } : undefined),
      setMicrophoneEnabled: vi.fn(),
      unpublishTrack: vi.fn(),
    },
  }
  vi.stubGlobal('navigator', { mediaDevices: {
    enumerateDevices: vi.fn(async () => Array.from({ length: cameraCount }, (_, i) => ({ kind: 'videoinput', deviceId: String(i) }))),
    getSupportedConstraints: vi.fn(() => ({ zoom: zoom != null })),
  } })
  return { track, room, typedRoom: room as unknown as Room }
}

afterEach(() => vi.unstubAllGlobals())

describe('LIVE camera switch', () => {
  it('renders a persistent in-video control with a mobile touch target', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('className="pl-live__camera-switch"')
    expect(screen).toContain('data-camera-facing={cameraFacing}')
    expect(screen).toContain('data-switch-available={cameraSwitchAvailable}')
    expect(screen).toContain("phase === 'live'")
    expect(css).toMatch(/\.pl-live__camera-switch\s*\{[\s\S]*position: absolute[\s\S]*width: 58px[\s\S]*height: 58px/)
    expect(css).toContain(".pl-live[data-layout='phone-landscape'] .pl-live__camera-switch")
  })

  it('reports whether more than one video input is available', async () => {
    fixture('user', 2)
    await expect(canSwitchHostCamera()).resolves.toBe(true)
    fixture('user', 1)
    await expect(canSwitchHostCamera()).resolves.toBe(false)
  })

  it('switches front to rear and back without disconnecting audio or the room', async () => {
    const { track, room, typedRoom } = fixture()
    expect(await switchHostCamera(typedRoom, 'user')).toBe('environment')
    expect(await switchHostCamera(typedRoom, 'environment')).toBe('user')
    expect(track.restartTrack.mock.calls.map(([options]) => options.facingMode)).toEqual(['environment', 'user'])
    expect(track.restartTrack.mock.calls.every(([options]) => options.resolution === PORTRAIT_LIVE_CAPTURE)).toBe(true)
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(room.localParticipant.unpublishTrack).not.toHaveBeenCalled()
  })

  it('rejects a single camera before changing the working video', async () => {
    const { track, typedRoom } = fixture('user', 1)
    await expect(switchHostCamera(typedRoom, 'user')).rejects.toThrow('この端末では')
    expect(track.restartTrack).not.toHaveBeenCalled()
  })

  it('restores the original device after capture failure', async () => {
    const { track, room, typedRoom } = fixture()
    track.restartTrack.mockRejectedValueOnce(new Error('NotReadableError'))
    await expect(switchHostCamera(typedRoom, 'user')).rejects.toThrow('元のカメラで配信を継続')
    expect(track.restartTrack.mock.calls[1][0]).toMatchObject({ facingMode: 'user', deviceId: { exact: 'user' } })
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('restores when a browser silently keeps the wrong camera', async () => {
    const { track, typedRoom } = fixture()
    track.restartTrack.mockImplementationOnce(async () => {})
    await expect(switchHostCamera(typedRoom, 'user')).rejects.toThrow('元のカメラで配信を継続')
    expect(track.restartTrack).toHaveBeenCalledTimes(2)
  })

  it('reapplies portrait constraints when iPhone rear camera reports landscape settings', async () => {
    const { track, typedRoom } = fixture()
    track.restartTrack.mockImplementationOnce(async (options) => {
      const settings = track.mediaStreamTrack.getSettings()
      Object.assign(settings, {
        facingMode: options.facingMode,
        deviceId: options.facingMode,
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
      })
    })

    await expect(switchHostCamera(typedRoom, 'user')).resolves.toBe('environment')
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { ideal: 9 / 16 },
    }))
  })

  it('classifies the effective track orientation from aspect ratio or dimensions', () => {
    expect(trackVideoOrientation({ width: 720, height: 1280 })).toBe('portrait')
    expect(trackVideoOrientation({ width: 1920, height: 1080, aspectRatio: 16 / 9 })).toBe('landscape')
    expect(trackVideoOrientation({})).toBe('unknown')
  })

  it('locks the phone portrait stage without forcing crop-to-fill', () => {
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    expect(css).toMatch(/phone-portrait'\] \.pl-live__stage\s*\{[\s\S]*aspect-ratio: 9 \/ 16;[\s\S]*max-height: none;/)
    expect(css).not.toMatch(/phone-portrait'\] \.pl-live__video\s*\{[\s\S]*object-fit: cover;/)
    expect(screen).toContain("'--video-fit': 'contain'")
  })

  it('returns optical 1x when supported and otherwise the lowest zoom', () => {
    expect(naturalZoomForRange({ min: 0.5, max: 5 })).toBe(1)
    expect(naturalZoomForRange({ min: 2, max: 5 })).toBe(2)
  })

  it('resets an unwanted supported digital zoom without replacing the track', async () => {
    const { track } = fixture('user', 2, 2)
    await expect(preferNaturalCameraFieldOfView(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toBe(true)
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
      width: { ideal: 720 },
      height: { ideal: 1280 },
      advanced: [{ zoom: 1 }],
    }))
    expect(track.mediaStreamTrack.getSettings().zoom).toBe(1)
  })

  it('leaves zoom untouched when the browser does not expose zoom capability', async () => {
    const { track } = fixture()
    await expect(preferNaturalCameraFieldOfView(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toBe(false)
    expect(track.mediaStreamTrack.applyConstraints).not.toHaveBeenCalled()
  })
})
