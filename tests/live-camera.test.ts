import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Track, type Room } from 'livekit-client'
import {
  canSwitchHostCamera,
  ensurePortraitCameraTrack,
  LANDSCAPE_LIVE_CAPTURE,
  liveCameraSnapshot,
  naturalZoomForRange,
  PORTRAIT_LIVE_CAPTURE,
  preferNaturalCameraFieldOfView,
  switchHostCamera,
  trackVideoOrientation,
} from '../src/platform/lib/liveCamera'
import {
  containedRect,
  currentLiveVideoOrientation,
  LIVE_OUTPUT_HEIGHT,
  LIVE_OUTPUT_WIDTH,
  liveOutputSize,
  waitForVideoFrameAdvance,
} from '../src/platform/lib/livePortraitProcessor'
import { computeLiveLayoutMode } from '../src/platform/lib/useLiveLayout'
import {
  restartHostCameraForOrientation,
  liveMediaDeviceErrorMessage,
  setHostCameraEnabled,
  setHostMicrophoneEnabled,
} from '../src/platform/lib/livekit'

function fixture(facing: 'user' | 'environment' = 'user', cameraCount = 2, zoom?: number) {
  let settings: MediaTrackSettings & { zoom?: number } = { facingMode: facing, deviceId: facing, width: 960, height: 1280, frameRate: 30, zoom }
  const track = {
    isMuted: false,
    mediaStreamTrack: {
      readyState: 'live',
      enabled: true,
      muted: false,
      getSettings: () => settings,
      getCapabilities: vi.fn(() => zoom == null ? {} : { zoom: { min: 1, max: 5, step: 0.1 } }),
      getConstraints: vi.fn(() => ({ width: { ideal: 960, max: 960 }, height: { ideal: 1280, max: 1280 }, aspectRatio: { exact: 3 / 4 } })),
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
    getProcessor: vi.fn(() => undefined),
    setProcessor: vi.fn(),
  }
  const room = {
    disconnect: vi.fn(),
    localParticipant: {
      getTrackPublication: vi.fn((source) => source === Track.Source.Camera ? { track } : undefined),
      setCameraEnabled: vi.fn(),
      setMicrophoneEnabled: vi.fn(),
      unpublishTrack: vi.fn(),
    },
  }
  vi.stubGlobal('navigator', { mediaDevices: {
    enumerateDevices: vi.fn(async () => Array.from({ length: cameraCount }, (_, i) => ({ kind: 'videoinput', deviceId: String(i) }))),
    getSupportedConstraints: vi.fn(() => ({ zoom: zoom != null, resizeMode: true })),
  } })
  return { track, room, typedRoom: room as unknown as Room }
}

afterEach(() => vi.unstubAllGlobals())

describe('LIVE camera switch', () => {
  it('renders a persistent in-video control with a mobile touch target', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('className="pl-live__media-control pl-live__camera-switch"')
    expect(screen).toContain('data-camera-facing={cameraFacing}')
    expect(screen).toContain('data-switch-available={cameraSwitchAvailable}')
    expect(screen).toContain("phase === 'live'")
    expect(css).toMatch(/\.pl-live__media-controls\s*\{[\s\S]*position: absolute/)
    expect(css).toMatch(/\.pl-live__media-control\s*\{[\s\S]*width: 54px[\s\S]*height: 54px/)
    expect(css).toContain(".pl-live[data-layout='phone-landscape'] .pl-live__media-controls")
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

  it('uses landscape capture constraints for both cameras while the phone is horizontal', async () => {
    const { track, typedRoom } = fixture()
    await switchHostCamera(typedRoom, 'user', 'landscape')
    await switchHostCamera(typedRoom, 'environment', 'landscape')
    expect(track.restartTrack.mock.calls.every(([options]) => options.resolution === LANDSCAPE_LIVE_CAPTURE)).toBe(true)
    expect(track.mediaStreamTrack.applyConstraints).not.toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: { exact: 3 / 4 },
    }))
  })

  it('keeps producing the requested camera across ten front/rear switches', async () => {
    const { track, room, typedRoom } = fixture()
    let facing: 'user' | 'environment' = 'user'
    for (let index = 0; index < 10; index += 1) facing = await switchHostCamera(typedRoom, facing)
    expect(facing).toBe('user')
    expect(track.restartTrack).toHaveBeenCalledTimes(10)
    expect(track.mediaStreamTrack.getSettings()).toMatchObject({ facingMode: 'user', width: 960, height: 1280 })
    expect(room.disconnect).not.toHaveBeenCalled()
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
      width: { ideal: 960, max: 960 },
      height: { ideal: 1280, max: 1280 },
      aspectRatio: { exact: 3 / 4 },
      resizeMode: 'none',
    }))
  })

  it('classifies the effective track orientation from aspect ratio or dimensions', () => {
    expect(trackVideoOrientation({ width: 720, height: 1280 })).toBe('portrait')
    expect(trackVideoOrientation({ width: 1920, height: 1080, aspectRatio: 16 / 9 })).toBe('landscape')
    expect(trackVideoOrientation({})).toBe('unknown')
  })

  it('reports camera settings without exposing the device id', () => {
    const { track } = fixture('environment', 2, 1)
    const snapshot = liveCameraSnapshot(track.mediaStreamTrack as unknown as MediaStreamTrack)
    expect(snapshot).toEqual({
      facingMode: 'environment',
      width: 960,
      height: 1280,
      aspectRatio: 3 / 4,
      frameRate: 30,
      zoom: 1,
      readyState: 'live',
      enabled: true,
      muted: false,
    })
    expect(snapshot).not.toHaveProperty('deviceId')
  })

  it('maps official LiveKit media failure categories to actionable Japanese guidance', () => {
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotAllowedError'))).toContain('許可')
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotFoundError'))).toContain('見つかりません')
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotReadableError'))).toContain('他のアプリ')
    expect(liveMediaDeviceErrorMessage(new Error('unknown'))).toContain('端末の状態')
  })

  it('locks the phone portrait stage without a crop-to-fill fallback', () => {
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const viewer = readFileSync('src/platform/screens/LiveWatchScreen.tsx', 'utf8')
    expect(css).toMatch(/phone-portrait'\] \.pl-live__stage\s*\{[\s\S]*aspect-ratio: 9 \/ 16;[\s\S]*max-height: none;/)
    expect(css).not.toMatch(/phone-portrait'\] \.pl-live__video\s*\{[^}]*object-fit: cover;/)
    expect(screen).toContain("'--video-fit': 'contain'")
    expect(viewer).toContain("'--video-fit': objectFit")
    expect(screen).not.toContain("? 'cover' : 'contain'")
    expect(viewer).not.toContain("videoOrient === 'landscape' ? 'cover'")
  })

  it('prefers an uncropped natural portrait camera mode when Safari initially returns landscape', async () => {
    const { track } = fixture()
    const settings = track.mediaStreamTrack.getSettings()
    Object.assign(settings, { width: 1920, height: 1080, aspectRatio: 16 / 9 })

    await expect(ensurePortraitCameraTrack(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toMatchObject({
      width: 960,
      height: 1280,
      aspectRatio: 3 / 4,
    })
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
      width: { ideal: 960, max: 960 },
      height: { ideal: 1280, max: 1280 },
      aspectRatio: { exact: 3 / 4 },
      resizeMode: 'none',
    }))
  })

  it('composes the complete camera frame inside a 9:16 sender track without stretching', () => {
    const liveKit = readFileSync('src/platform/lib/livekit.ts', 'utf8')
    const camera = readFileSync('src/platform/lib/liveCamera.ts', 'utf8')
    expect([LIVE_OUTPUT_WIDTH, LIVE_OUTPUT_HEIGHT]).toEqual([720, 1280])
    expect(liveKit).toContain('new PortraitContainProcessor(orientation)')
    expect(liveKit).toContain('await processor.waitForFrameAdvance()')
    expect(camera).not.toMatch(/resizeMode\s*=\s*['"]crop-and-scale['"]/)
    expect(containedRect(960, 1280, LIVE_OUTPUT_WIDTH, LIVE_OUTPUT_HEIGHT)).toEqual({
      x: 0,
      y: 160,
      width: 720,
      height: 960,
    })
    expect(containedRect(1920, 1080, LIVE_OUTPUT_WIDTH, LIVE_OUTPUT_HEIGHT)).toEqual({
      x: 0,
      y: 437.5,
      width: 720,
      height: 405,
    })
    const processor = readFileSync('src/platform/lib/livePortraitProcessor.ts', 'utf8')
    expect(processor).not.toContain('globalAlpha = 0.2')
    expect(processor.match(/context\.drawImage\(/g)).toHaveLength(1)
  })

  it('classifies rotated iPhones as phones and keeps tablet/desktop layouts separate', () => {
    expect(computeLiveLayoutMode(390, 844, 'portrait')).toBe('phone-portrait')
    expect(computeLiveLayoutMode(844, 390, 'landscape')).toBe('phone-landscape')
    expect(computeLiveLayoutMode(1024, 768, 'landscape')).toBe('tablet-landscape')
    expect(computeLiveLayoutMode(1440, 900, 'landscape')).toBe('desktop')
  })

  it('keeps landscape performer controls, comments, and end button in separate safe areas', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('pl-live--performer')
    expect(screen).toContain('pl-live__end-live')
    expect(css).toContain(".pl-live--performer[data-layout='phone-landscape'][data-phase='live'] .pl-live__panel--live")
    expect(css).toMatch(/phone-landscape'\] \.pl-live__media-controls\s*\{[\s\S]*top:[\s\S]*bottom: auto/)
    expect(css).toMatch(/phone-landscape'\] \.pl-live__panel\s*\{[\s\S]*right: max\(76px/)
  })

  it('keeps LIVE screen layout rules in one stylesheet so global CSS cannot override rotation layouts', () => {
    const liveCss = readFileSync('src/platform/screens/live.css', 'utf8')
    const experienceCss = readFileSync('src/platform/experience.css', 'utf8')
    expect(experienceCss).not.toMatch(/^\.pl-live--watch\b/m)
    expect(experienceCss).not.toMatch(/^\.pl-live__panel--live\b/m)
    expect(experienceCss).not.toMatch(/^\.pl-live__side-actions\b/m)
    expect(liveCss).toContain(".pl-live--watch[data-layout='phone-portrait']")
    expect(liveCss).toContain(".pl-live--watch[data-layout='phone-landscape'] .pl-live__side-actions")
    expect(liveCss).toMatch(/phone-landscape'\] \.pl-live__panel\s*\{[\s\S]*safe-area-inset-left[\s\S]*safe-area-inset-right/)
  })

  it('switches the published canvas between portrait 9:16 and landscape 16:9', () => {
    expect(liveOutputSize('portrait')).toEqual({ width: 720, height: 1280 })
    expect(liveOutputSize('landscape')).toEqual({ width: 1280, height: 720 })
    vi.stubGlobal('window', { innerWidth: 844, innerHeight: 390 })
    expect(currentLiveVideoOrientation()).toBe('landscape')
  })

  it.each([
    ['portrait', 'user', 720, 1280],
    ['portrait', 'environment', 720, 1280],
    ['landscape', 'user', 1280, 720],
    ['landscape', 'environment', 1280, 720],
  ] as const)('keeps %s output for the %s camera', (orientation, _facing, width, height) => {
    expect(liveOutputSize(orientation)).toEqual({ width, height })
  })

  it('requires consecutive browser video frames instead of accepting a still image', async () => {
    const callbacks: VideoFrameRequestCallback[] = []
    const video = {
      currentTime: 0,
      readyState: 4,
      play: vi.fn(async () => undefined),
      requestVideoFrameCallback: vi.fn((callback: VideoFrameRequestCallback) => {
        callbacks.push(callback)
        return callbacks.length
      }),
      cancelVideoFrameCallback: vi.fn(),
    }
    const framePromise = waitForVideoFrameAdvance(video, 2, 1_000)
    callbacks.shift()?.(10, {} as VideoFrameCallbackMetadata)
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(20, {} as VideoFrameCallbackMetadata)
    await expect(framePromise).resolves.toBe(2)
  })

  it('stops and resumes microphone/camera tracks without disconnecting the room', async () => {
    const { room, typedRoom } = fixture()
    await expect(setHostMicrophoneEnabled(typedRoom, false)).resolves.toBe(false)
    await expect(setHostCameraEnabled(typedRoom, false, 'user', 'portrait')).resolves.toBe(false)
    await expect(setHostCameraEnabled(typedRoom, true, 'user', 'portrait')).resolves.toBe(true)
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false)
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, expect.objectContaining({ facingMode: 'user' }))
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('restarts only the camera track with a 30fps landscape preset after rotation', async () => {
    const { track, room, typedRoom } = fixture()
    await expect(restartHostCameraForOrientation(typedRoom, 'user', 'landscape')).resolves.toBe(true)
    expect(track.restartTrack).toHaveBeenCalledWith({
      resolution: LANDSCAPE_LIVE_CAPTURE,
      facingMode: 'user',
    })
    expect(LANDSCAPE_LIVE_CAPTURE).toMatchObject({ width: 1280, height: 720, frameRate: 30, aspectRatio: 16 / 9 })
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('provides accessible media controls and privacy stops on backgrounding', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    expect(screen).toContain('aria-label={microphoneEnabled ? \'マイクを停止\' : \'マイクを再開\'}')
    expect(screen).toContain('aria-label={cameraEnabled ? \'カメラを停止\' : \'カメラを再開\'}')
    expect(screen).toContain("document.addEventListener('visibilitychange', handleVisibility)")
    expect(screen).toContain("window.addEventListener('pagehide', stopTracksForPrivacy)")
    expect(screen).toContain('Date.now() - hiddenAt >= 60_000')
  })

  it('returns optical 1x when supported and otherwise the lowest zoom', () => {
    expect(naturalZoomForRange({ min: 0.5, max: 5 })).toBe(1)
    expect(naturalZoomForRange({ min: 2, max: 5 })).toBe(2)
  })

  it('resets an unwanted supported digital zoom without replacing the track', async () => {
    const { track } = fixture('user', 2, 2)
    await expect(preferNaturalCameraFieldOfView(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toBe(true)
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
      width: { ideal: 960, max: 960 },
      height: { ideal: 1280, max: 1280 },
      aspectRatio: { exact: 3 / 4 },
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
