import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Track, type Room } from 'livekit-client'
import {
  canSwitchHostCamera,
  ensurePortraitCameraTrack,
  LANDSCAPE_LIVE_CAPTURE,
  liveCameraCapabilities,
  liveCameraSnapshot,
  liveDisplayCrop,
  liveFrameDiagnostics,
  liveStageAspect,
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
import { resolveLiveOrientation } from '../src/platform/lib/liveOrientationPreference'
import {
  restartHostCameraForOrientation,
  liveMediaDeviceErrorMessage,
  setHostCameraEnabled,
  setHostMicrophoneEnabled,
} from '../src/platform/lib/livekit'

function fixture(facing: 'user' | 'environment' = 'user', cameraCount = 2, zoom?: number) {
  let settings: MediaTrackSettings & { zoom?: number } = { facingMode: facing, deviceId: facing, width: 960, height: 1280, aspectRatio: 3 / 4, frameRate: 30, zoom }
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
  it('renders persistent camera controls with mobile touch targets in the studio panel', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('className="pl-live__media-control pl-live__camera-switch"')
    expect(screen).toContain('data-camera-facing={cameraFacing}')
    expect(screen).toContain('data-switch-available={cameraSwitchAvailable}')
    expect(screen).toContain('pl-live__studio-tools')
    expect(screen).toContain('aria-expanded={settingsOpen}')
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
    expect(track.mediaStreamTrack.getSettings()).toMatchObject({ facingMode: 'user', width: 720, height: 1280 })
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

  it('requests an uncropped native 9:16 mode when iPhone rear camera reports landscape settings', async () => {
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
      width: { ideal: 720, max: 960 },
      height: { ideal: 1280, max: 1280 },
      aspectRatio: { exact: 9 / 16 },
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
      resizeMode: null,
    })
    expect(snapshot).not.toHaveProperty('deviceId')
  })

  it('maps official LiveKit media failure categories to actionable Japanese guidance', () => {
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotAllowedError'))).toContain('許可')
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotFoundError'))).toContain('見つかりません')
    expect(liveMediaDeviceErrorMessage(new DOMException('', 'NotReadableError'))).toContain('他のアプリ')
    expect(liveMediaDeviceErrorMessage(new Error('unknown'))).toContain('端末の状態')
  })

  it('offers display-only cover and contain with a crop warning before broadcast', () => {
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const viewer = readFileSync('src/platform/screens/LiveWatchScreen.tsx', 'utf8')
    expect(css).toContain(".pl-live--performer[data-layout='phone-portrait'][data-phase='live'] .pl-live__stage")
    expect(css).toContain('height: min(72svh, calc(100vw / var(--video-aspect)));')
    expect(screen).toContain("'--video-fit': videoFit")
    expect(screen).toContain('配信前に全画面／全画角を切り替え')
    expect(screen).toContain('送信映像は切り取りません')
    expect(viewer).toContain("'--video-fit': objectFit")
    expect(viewer).not.toContain("videoOrient === 'landscape' ? 'cover'")
  })

  it('reports display-only crop correctly for 4:3 camera on portrait and landscape stages', () => {
    expect(liveDisplayCrop(4 / 3, 9 / 16, 'cover')).toEqual({ percent: 58, axis: 'horizontal' })
    expect(liveDisplayCrop(4 / 3, 16 / 9, 'cover')).toEqual({ percent: 25, axis: 'vertical' })
    expect(liveDisplayCrop(4 / 3, 9 / 16, 'contain')).toEqual({ percent: 0, axis: null })
  })

  it.each([
    ['portrait', 9 / 16, 'cover', 9 / 16],
    ['portrait', 9 / 16, 'contain', 9 / 16],
    ['landscape', 9 / 16, 'cover', 16 / 9],
    ['landscape', 9 / 16, 'contain', 9 / 16],
    ['portrait', 16 / 9, 'cover', 9 / 16],
    ['portrait', 16 / 9, 'contain', 16 / 9],
  ] as const)('uses the actual frame for contain: requested %s, actual %s, fit %s', (requested, actual, fit, expected) => {
    expect(liveStageAspect(requested, actual, fit)).toBe(expected)
  })

  it('keeps contain unrotated and distinguishes requested from actual orientation in the studio', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('liveStageAspect(videoOrientation, actualAspect, videoFit)')
    expect(screen).toContain('選択：')
    expect(screen).toContain('実映像：')
    expect(css).toContain("[data-video-fit='cover'][data-requested-orientation='landscape']")
    expect(css).not.toMatch(/\.pl-live__video\s*\{[^}]*rotate\(/)
    expect(css).toContain('object-fit: var(--video-fit, contain)')
  })

  it.each(['portrait', 'landscape'] as const)('keeps auto %s cover and contain tied to the device request but only contains the actual frame', (deviceOrientation) => {
    const requested = resolveLiveOrientation('auto', deviceOrientation)
    const actual = deviceOrientation === 'portrait' ? 16 / 9 : 9 / 16
    expect(liveStageAspect(requested, actual, 'cover')).toBe(deviceOrientation === 'portrait' ? 9 / 16 : 16 / 9)
    expect(liveStageAspect(requested, actual, 'contain')).toBe(actual)
  })

  it('exposes only safe capability ranges, not camera identifiers', () => {
    const { track } = fixture()
    track.mediaStreamTrack.getCapabilities.mockReturnValue({
      width: { min: 320, max: 1920 }, height: { min: 240, max: 1280 },
      aspectRatio: { min: 9 / 16, max: 16 / 9 }, resizeMode: ['none', 'crop-and-scale'],
      deviceId: 'secret-camera-id',
    } as never)
    const capabilities = liveCameraCapabilities(track.mediaStreamTrack as unknown as MediaStreamTrack)
    expect(capabilities.aspectRatio).toEqual({ min: 9 / 16, max: 16 / 9 })
    expect(capabilities.resizeMode).toEqual(['none', 'crop-and-scale'])
    expect(JSON.stringify(capabilities)).not.toContain('secret-camera-id')
  })

  it('prefers an uncropped native 9:16 camera mode when Safari initially returns landscape', async () => {
    const { track } = fixture()
    const settings = track.mediaStreamTrack.getSettings()
    Object.assign(settings, { width: 1920, height: 1080, aspectRatio: 16 / 9 })

    await expect(ensurePortraitCameraTrack(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toMatchObject({
      width: 720,
      height: 1280,
      aspectRatio: 9 / 16,
    })
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({
      width: { ideal: 720, max: 960 },
      height: { ideal: 1280, max: 1280 },
      aspectRatio: { exact: 9 / 16 },
      resizeMode: 'none',
    }))
  })

  it('falls back to an uncropped native 3:4 source when 9:16 is unavailable', async () => {
    const { track } = fixture()
    const settings = track.mediaStreamTrack.getSettings()
    Object.assign(settings, { width: 1920, height: 1080, aspectRatio: 16 / 9 })
    track.mediaStreamTrack.applyConstraints.mockRejectedValueOnce(new DOMException('', 'OverconstrainedError'))
    await expect(ensurePortraitCameraTrack(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toMatchObject({
      width: 960, height: 1280, aspectRatio: 3 / 4,
    })
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenCalledTimes(2)
    expect(track.mediaStreamTrack.applyConstraints).toHaveBeenLastCalledWith(expect.objectContaining({
      aspectRatio: { exact: 3 / 4 }, resizeMode: 'none',
    }))
  })

  it('keeps an existing full-frame portrait source when crop control is unavailable', async () => {
    const { track } = fixture()
    vi.stubGlobal('navigator', { mediaDevices: { getSupportedConstraints: () => ({ resizeMode: false }) } })
    await expect(ensurePortraitCameraTrack(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toMatchObject({
      width: 960, height: 1280, aspectRatio: 3 / 4,
    })
    expect(track.mediaStreamTrack.applyConstraints).not.toHaveBeenCalled()
  })

  it('does not force a cropped portrait source when the browser cannot disable cropping', async () => {
    const { track } = fixture()
    const settings = track.mediaStreamTrack.getSettings()
    Object.assign(settings, { width: 1920, height: 1080, aspectRatio: 16 / 9 })
    vi.stubGlobal('navigator', { mediaDevices: { getSupportedConstraints: () => ({ resizeMode: false }) } })
    await expect(ensurePortraitCameraTrack(track.mediaStreamTrack as unknown as MediaStreamTrack)).resolves.toMatchObject({
      width: 1920, height: 1080, aspectRatio: 16 / 9,
    })
    expect(track.mediaStreamTrack.applyConstraints).not.toHaveBeenCalled()
  })

  it('publishes the actual camera frame without fixed-ratio canvas bars', () => {
    const liveKit = readFileSync('src/platform/lib/livekit.ts', 'utf8')
    const camera = readFileSync('src/platform/lib/liveCamera.ts', 'utf8')
    expect([LIVE_OUTPUT_WIDTH, LIVE_OUTPUT_HEIGHT]).toEqual([720, 1280])
    expect(liveKit).not.toContain('new PortraitContainProcessor(orientation)')
    expect(liveKit).not.toContain('cameraTrack.setProcessor(')
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

  it('compares capture, publication and preview without device identifiers', () => {
    const { track } = fixture()
    const source = track.mediaStreamTrack as unknown as MediaStreamTrack
    const diagnostics = liveFrameDiagnostics(source, undefined, { videoWidth: 960, videoHeight: 1280 }, 'portrait')
    expect(diagnostics.capture).toMatchObject({ width: 960, height: 1280, aspectRatio: 0.75 })
    expect(diagnostics.published).toEqual({ width: 960, height: 1280, aspectRatio: 0.75 })
    expect(diagnostics.preview).toEqual({ width: 960, height: 1280, aspectRatio: 0.75 })
    expect(diagnostics.constrained).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('deviceId')
    expect(liveFrameDiagnostics(source, undefined, { videoWidth: 720, videoHeight: 1280 }, 'portrait').publicationMismatch).toBe(true)
    expect(liveFrameDiagnostics(source, undefined, { videoWidth: 960, videoHeight: 1280 }, 'landscape').constrained).toBe(true)
    const publishedTrack = { getSettings: () => ({ width: 1280, height: 720, aspectRatio: 16 / 9 }) } as MediaStreamTrack
    expect(liveFrameDiagnostics(source, publishedTrack, { videoWidth: 960, videoHeight: 1280 }, 'portrait')).toMatchObject({
      published: { width: 1280, height: 720 },
      publicationMismatch: true,
      constrained: true,
    })
  })

  it.each([
    [720, 1280, 'portrait', false],
    [1280, 720, 'landscape', false],
    [960, 1280, 'portrait', true],
  ] as const)('diagnoses %ix%i source and viewer dimensions without stretching', (width, height, requested, constrained) => {
    const { track } = fixture()
    const settings = track.mediaStreamTrack.getSettings()
    Object.assign(settings, { width, height, aspectRatio: width / height })
    const result = liveFrameDiagnostics(track.mediaStreamTrack as unknown as MediaStreamTrack, undefined, { videoWidth: width, videoHeight: height }, requested)
    expect(result.capture.aspectRatio).toBe(width / height)
    expect(result.published.aspectRatio).toBe(width / height)
    expect(result.preview.aspectRatio).toBe(width / height)
    expect(result.publicationMismatch).toBe(false)
    expect(result.constrained).toBe(constrained)
  })

  it('classifies rotated iPhones as phones and keeps tablet/desktop layouts separate', () => {
    expect(computeLiveLayoutMode(390, 844, 'portrait')).toBe('phone-portrait')
    expect(computeLiveLayoutMode(844, 390, 'landscape')).toBe('phone-landscape')
    expect(computeLiveLayoutMode(1024, 768, 'landscape')).toBe('tablet-landscape')
    expect(computeLiveLayoutMode(1440, 900, 'landscape')).toBe('desktop')
  })

  it('keeps landscape performer controls, comments, and end button in a separate safe-area panel', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    const css = readFileSync('src/platform/screens/live.css', 'utf8')
    expect(screen).toContain('pl-live--performer')
    expect(screen).toContain('pl-live__end-live')
    expect(css).toContain(".pl-live--performer[data-layout='phone-landscape'][data-phase='live'] .pl-live__panel--live")
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(240px, 34vw)')
    expect(css).toContain(".pl-live--performer[data-phase='live'] .pl-live__media-controls")
    expect(screen).toContain('pl-live__studio-tools')
    expect(screen).toContain('pl-live__end-confirm')
  })

  it('keeps gifts, FEVER and comments visible while offering a confirmed end and result summary', () => {
    const screen = readFileSync('src/platform/screens/PerformerLiveScreen.tsx', 'utf8')
    expect(screen).toContain('<TipGiftOverlay')
    expect(screen).toContain('<LiveFeverOverlay')
    expect(screen).toContain('commentScroll.listRef')
    expect(screen).toContain('setLastResult({ viewers: peakRef.current, likes: fever.likes, gifts: giftCount })')
    expect(screen).toContain("confirmEnd ? '終了を確定' : 'LIVE終了'")
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
    const { track, room, typedRoom } = fixture()
    await expect(setHostMicrophoneEnabled(typedRoom, false)).resolves.toBe(false)
    await expect(setHostCameraEnabled(typedRoom, false, 'user', 'portrait')).resolves.toBe(false)
    await expect(setHostCameraEnabled(typedRoom, true, 'user', 'portrait')).resolves.toBe(true)
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false)
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false)
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, expect.objectContaining({ facingMode: 'user' }))
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(track.setProcessor).not.toHaveBeenCalled()
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
    expect(track.setProcessor).not.toHaveBeenCalled()
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
