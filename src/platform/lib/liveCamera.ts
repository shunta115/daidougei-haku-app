import { Track, type LocalVideoTrack, type Room, type VideoCaptureOptions } from 'livekit-client'
import type { LiveVideoOrientation } from './liveOrientation'

export type CameraFacing = 'user' | 'environment'
export type LiveVideoFit = 'cover' | 'contain'

export const PORTRAIT_LIVE_CAPTURE = {
  width: 960,
  height: 1280,
  frameRate: 30,
  aspectRatio: 3 / 4,
} as const

export const LANDSCAPE_LIVE_CAPTURE = {
  width: 1280,
  height: 720,
  frameRate: 30,
  aspectRatio: 16 / 9,
} as const

export type TrackVideoOrientation = 'portrait' | 'landscape' | 'unknown'

export type LiveCameraSnapshot = {
  facingMode: string | null
  width: number | null
  height: number | null
  aspectRatio: number | null
  frameRate: number | null
  zoom: number | null
  readyState: MediaStreamTrackState
  enabled: boolean
  muted: boolean
  resizeMode: string | null
}

type NumericRange = { min: number; max: number }
export type LiveCameraCapabilities = {
  width: NumericRange | null
  height: NumericRange | null
  aspectRatio: NumericRange | null
  resizeMode: string[]
  zoom: NumericRange | null
}

export type LiveCameraRequest = {
  facingMode: string | null
  width: number | null
  height: number | null
  aspectRatio: number | null
  resizeMode: string | null
}

export type LiveFrameDiagnostics = {
  capture: LiveCameraSnapshot
  request: LiveCameraRequest
  capabilities: LiveCameraCapabilities
  published: { width: number | null; height: number | null; aspectRatio: number | null }
  preview: { width: number | null; height: number | null; aspectRatio: number | null }
  actualOrientation: TrackVideoOrientation
  requestedOrientation: LiveVideoOrientation
  constrained: boolean
  publicationMismatch: boolean
}

/** Compare browser capture, LiveKit publication and rendered preview without device IDs. */
export function liveFrameDiagnostics(
  track: MediaStreamTrack,
  publishedTrack: MediaStreamTrack | undefined,
  preview: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'> | null,
  requestedOrientation: LiveVideoOrientation,
): LiveFrameDiagnostics {
  const capture = liveCameraSnapshot(track)
  const sent = publishedTrack?.getSettings() ?? track.getSettings()
  const published = {
    width: sent.width ?? null,
    height: sent.height ?? null,
    aspectRatio: sent.aspectRatio ?? (sent.width && sent.height ? sent.width / sent.height : null),
  }
  const previewWidth = preview?.videoWidth || null
  const previewHeight = preview?.videoHeight || null
  const displayed = {
    width: previewWidth,
    height: previewHeight,
    aspectRatio: previewWidth && previewHeight ? previewWidth / previewHeight : null,
  }
  const actualOrientation = trackVideoOrientation({
    width: displayed.width ?? published.width ?? capture.width ?? undefined,
    height: displayed.height ?? published.height ?? capture.height ?? undefined,
    aspectRatio: displayed.aspectRatio ?? published.aspectRatio ?? capture.aspectRatio ?? undefined,
  })
  const actualRatio = displayed.aspectRatio ?? published.aspectRatio ?? capture.aspectRatio
  const requestedRatio = requestedOrientation === 'portrait' ? 9 / 16 : 16 / 9
  const publicationMismatch = displayed.aspectRatio != null && published.aspectRatio != null
    && Math.abs(displayed.aspectRatio - published.aspectRatio) > 0.08
  return {
    capture,
    request: liveCameraRequest(track),
    capabilities: liveCameraCapabilities(track),
    published,
    preview: displayed,
    actualOrientation,
    requestedOrientation,
    constrained: publicationMismatch || actualOrientation !== 'unknown' && (
      actualOrientation !== requestedOrientation || (actualRatio != null && Math.abs(actualRatio - requestedRatio) > 0.08)
    ),
    publicationMismatch,
  }
}

/** Only expose non-identifying constraints; deviceId and groupId stay private. */
export function liveCameraRequest(mediaTrack: MediaStreamTrack): LiveCameraRequest {
  const values = mediaTrack.getConstraints() as MediaTrackConstraints & { resizeMode?: unknown }
  const number = (value: unknown): number | null => {
    if (typeof value === 'number') return value
    if (value && typeof value === 'object') {
      const entry = value as { exact?: unknown; ideal?: unknown }
      const selected = entry.exact ?? entry.ideal
      return typeof selected === 'number' ? selected : null
    }
    return null
  }
  const string = (value: unknown): string | null => {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
      const entry = value as { exact?: unknown; ideal?: unknown }
      const selected = entry.exact ?? entry.ideal
      return typeof selected === 'string' ? selected : null
    }
    return null
  }
  return {
    facingMode: string(values.facingMode),
    width: number(values.width),
    height: number(values.height),
    aspectRatio: number(values.aspectRatio),
    resizeMode: string(values.resizeMode),
  }
}

/** Capability ranges are not a list of discrete camera modes. Never infer that 9:16 is native solely from the range. */
export function liveCameraCapabilities(mediaTrack: MediaStreamTrack): LiveCameraCapabilities {
  const empty: LiveCameraCapabilities = { width: null, height: null, aspectRatio: null, resizeMode: [], zoom: null }
  if (typeof mediaTrack.getCapabilities !== 'function') return empty
  try {
    const values = mediaTrack.getCapabilities() as MediaTrackCapabilities & { zoom?: NumericRange; resizeMode?: string[] }
    const range = (value: { min?: number; max?: number } | undefined): NumericRange | null =>
      value && typeof value.min === 'number' && typeof value.max === 'number' && Number.isFinite(value.min) && Number.isFinite(value.max)
        ? { min: value.min, max: value.max } : null
    return {
      width: range(values.width),
      height: range(values.height),
      aspectRatio: range(values.aspectRatio),
      resizeMode: Array.isArray(values.resizeMode) ? values.resizeMode.filter((mode) => mode === 'none' || mode === 'crop-and-scale') : [],
      zoom: range(values.zoom),
    }
  } catch {
    return empty
  }
}

/** Percentage of the source frame hidden by a display-only cover fit. */
export function liveDisplayCrop(sourceRatio: number | null | undefined, stageRatio: number | null | undefined, fit: LiveVideoFit) {
  if (fit === 'contain' || !sourceRatio || !stageRatio || sourceRatio <= 0 || stageRatio <= 0) {
    return { percent: 0, axis: null as 'horizontal' | 'vertical' | null }
  }
  const axis = sourceRatio > stageRatio ? 'horizontal' : 'vertical'
  const visibleFraction = axis === 'horizontal' ? stageRatio / sourceRatio : sourceRatio / stageRatio
  return { percent: Math.max(0, Math.min(100, Math.round((1 - visibleFraction) * 100))), axis }
}

/** Contain follows the actual frame; cover alone may use the requested stage ratio. */
export function liveStageAspect(requested: LiveVideoOrientation, actualRatio: number | null | undefined, fit: LiveVideoFit) {
  const requestedRatio = requested === 'landscape' ? 16 / 9 : 9 / 16
  return fit === 'contain' && actualRatio != null && Number.isFinite(actualRatio) && actualRatio > 0
    ? actualRatio : requestedRatio
}

export function liveAspectLabel(ratio: number | null | undefined) {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return '不明'
  for (const [label, expected] of [['9:16', 9 / 16], ['3:4', 3 / 4], ['4:3', 4 / 3], ['16:9', 16 / 9]] as const) {
    if (Math.abs(ratio - expected) <= 0.02) return label
  }
  return `${ratio.toFixed(2)}:1`
}

type ZoomRange = { min: number; max: number; step?: number }
type ZoomCapableTrack = MediaStreamTrack & {
  getCapabilities(): MediaTrackCapabilities & { zoom?: ZoomRange }
  getSettings(): MediaTrackSettings & { zoom?: number }
}

export function trackVideoOrientation(settings: MediaTrackSettings): TrackVideoOrientation {
  const ratio = settings.aspectRatio ?? (
    settings.width && settings.height ? settings.width / settings.height : undefined
  )
  if (!ratio) return 'unknown'
  return ratio > 1.05 ? 'landscape' : 'portrait'
}

/** Safe, non-identifying camera diagnostics for support and switch validation. */
export function liveCameraSnapshot(mediaTrack: MediaStreamTrack): LiveCameraSnapshot {
  const settings = mediaTrack.getSettings() as MediaTrackSettings & { zoom?: number; resizeMode?: string }
  return {
    facingMode: settings.facingMode ?? null,
    width: settings.width ?? null,
    height: settings.height ?? null,
    aspectRatio: settings.aspectRatio ?? (
      settings.width && settings.height ? settings.width / settings.height : null
    ),
    frameRate: settings.frameRate ?? null,
    zoom: settings.zoom ?? null,
    readyState: mediaTrack.readyState,
    enabled: mediaTrack.enabled,
    muted: mediaTrack.muted,
    resizeMode: settings.resizeMode ?? null,
  }
}

export function naturalZoomForRange(range: ZoomRange) {
  return range.min <= 1 && range.max >= 1 ? 1 : range.min
}

/** Prefer optical 1x (or the lowest supported zoom) without failing camera use. */
export async function preferNaturalCameraFieldOfView(mediaTrack: MediaStreamTrack) {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { zoom?: boolean })
    | undefined
  if (!supported?.zoom || typeof mediaTrack.getCapabilities !== 'function') return false

  try {
    const track = mediaTrack as ZoomCapableTrack
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { zoom?: ZoomRange }
    const zoom = capabilities.zoom
    if (!zoom || !Number.isFinite(zoom.min) || !Number.isFinite(zoom.max)) return false

    const target = naturalZoomForRange(zoom)
    const current = track.getSettings().zoom
    if (current != null && Math.abs(current - target) < 0.001) return false

    const constraints = track.getConstraints()
    await track.applyConstraints({
      ...constraints,
      advanced: [
        ...(constraints.advanced ?? []),
        { zoom: target } as MediaTrackConstraintSet,
      ],
    })
    return true
  } catch {
    // Zoom is an optional enhancement and must never break a working camera.
    return false
  }
}

/** Probe uncropped camera modes on the current LiveKit source, without replacing the publication. */
export async function ensureNativeCameraTrack(mediaTrack: MediaStreamTrack, orientation: LiveVideoOrientation) {
  const originalConstraints = mediaTrack.getConstraints()
  let settings: MediaTrackSettings & { resizeMode?: string } = mediaTrack.getSettings()
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { resizeMode?: boolean })
    | undefined
  const ratio = settings.aspectRatio ?? ((settings.width ?? 0) / (settings.height || 1))
  const targetRatio = orientation === 'portrait' ? 9 / 16 : 16 / 9
  if (Math.abs(ratio - targetRatio) <= 0.02 && settings.resizeMode !== 'crop-and-scale') return settings
  // A capability range is not a list of native sensor modes. Only try exact
  // ratios when the browser can explicitly disable crop-and-scale.
  if (!supported?.resizeMode) return settings

  const modes = orientation === 'portrait'
    ? [{ width: 720, height: 1280 }, { width: 960, height: 1280 }]
    : [{ width: 1280, height: 720 }, { width: 1280, height: 960 }]
  for (const mode of modes) {
    const constraints = {
      ...originalConstraints,
      width: { ideal: mode.width, max: mode.width },
      height: { ideal: mode.height, max: mode.height },
      aspectRatio: { exact: mode.width / mode.height },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: { exact: 'none' },
    } as MediaTrackConstraints
    try {
      await mediaTrack.applyConstraints(constraints)
      // WebKit can report the previous dimensions immediately after reconfiguration.
      await new Promise((resolve) => setTimeout(resolve, 50))
      settings = mediaTrack.getSettings()
      const actual = settings.aspectRatio ?? ((settings.width ?? 0) / (settings.height || 1))
      if (Math.abs(actual - mode.width / mode.height) <= 0.02 && settings.resizeMode === 'none') {
        return settings
      }
    } catch { /* This sensor does not offer the requested uncropped mode. */ }
  }
  // A browser may accept a constraint but still return another mode. Restore
  // the source's prior request rather than leave an unverified mode selected.
  try { await mediaTrack.applyConstraints(originalConstraints) } catch { /* Keep the live source. */ }
  return mediaTrack.getSettings()
}

export async function ensurePortraitCameraTrack(mediaTrack: MediaStreamTrack) {
  return ensureNativeCameraTrack(mediaTrack, 'portrait')
}

export function hostCameraTrack(room: Room) {
  return room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined
}

export async function canSwitchHostCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((device) => device.kind === 'videoinput').length > 1
}

export async function switchHostCamera(
  room: Room,
  current: CameraFacing,
  orientation: LiveVideoOrientation = 'portrait',
): Promise<CameraFacing> {
  const track = hostCameraTrack(room)
  if (!track || track.isMuted) throw new Error('カメラをONにしてから切り替えてください。')
  if (!await canSwitchHostCamera()) {
    throw new Error('この端末では前面・背面カメラを切り替えられません。')
  }

  const previous = track.mediaStreamTrack.getSettings()
  const previousSnapshot = liveCameraSnapshot(track.mediaStreamTrack)
  const next = current === 'user' ? 'environment' : 'user'
  // Do not inherit the previous camera's sensor dimensions. On iPhone Safari,
  // the rear camera commonly reports a native landscape size even while the
  // phone is upright. Reusing it makes LiveKit publish a landscape track.
  const capture: VideoCaptureOptions = {
    resolution: orientation === 'landscape' ? LANDSCAPE_LIVE_CAPTURE : PORTRAIT_LIVE_CAPTURE,
  }

  try {
    // LiveKit updates the existing publication/sender. Audio and the Room remain intact.
    await track.restartTrack({ ...capture, facingMode: next })
    let selected = track.mediaStreamTrack.getSettings()
    if (
      (selected.facingMode && selected.facingMode !== next) ||
      (!selected.facingMode && previous.deviceId && selected.deviceId === previous.deviceId)
    ) {
      throw new Error('requested_camera_unavailable')
    }

    // Constraints are preferences in WebKit. Ask the selected source once more
    // when its effective settings are still landscape, without replacing the
    // LiveKit publication or touching the microphone/Room.
    selected = await ensureNativeCameraTrack(track.mediaStreamTrack, orientation)

    await preferNaturalCameraFieldOfView(track.mediaStreamTrack)
    selected = track.mediaStreamTrack.getSettings()

    console.info('[HAKU LIVE] Camera switch ready', {
      orientation,
      previous: previousSnapshot,
      current: liveCameraSnapshot(track.mediaStreamTrack),
    })

    // Read width/height/aspectRatio after every switch. Some Safari versions
    // retain sensor-native settings even though the rendered frames are rotated.
    // Keep the diagnostic, but never crop the preview merely to hide it.
    if (orientation === 'portrait' && trackVideoOrientation(selected) === 'landscape') {
      console.warn('[HAKU LIVE] Camera retained landscape settings after portrait constraints', {
        width: selected.width,
        height: selected.height,
        aspectRatio: selected.aspectRatio,
        facingMode: selected.facingMode,
      })
    }
    return next
  } catch (error) {
    console.warn('[HAKU LIVE] Camera switch failed; restoring previous camera', {
      orientation,
      previous: previousSnapshot,
      failure: error instanceof Error ? error.name : 'unknown',
    })
    try {
      await track.restartTrack({
        ...capture,
        facingMode: current,
        ...(previous.deviceId ? { deviceId: { exact: previous.deviceId } } : {}),
      })
      console.info('[HAKU LIVE] Previous camera restored', {
        orientation,
        current: liveCameraSnapshot(track.mediaStreamTrack),
      })
    } catch {
      throw new Error('カメラを切り替えられず、元の映像も復元できませんでした。カメラの許可を確認してください。音声と配信ルームは維持しています。')
    }
    throw new Error('カメラを切り替えられませんでした。元のカメラで配信を継続しています。')
  }
}
