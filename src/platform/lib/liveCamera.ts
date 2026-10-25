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

export type LiveFrameDiagnostics = {
  capture: LiveCameraSnapshot
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

/** Try a native 9:16 mode first, then a native 3:4 mode, never crop-and-scale. */
export async function ensurePortraitCameraTrack(mediaTrack: MediaStreamTrack) {
  let settings = mediaTrack.getSettings()
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { resizeMode?: boolean })
    | undefined
  const actualRatio = settings.aspectRatio ?? ((settings.width ?? 0) / (settings.height || 1))
  if (trackVideoOrientation(settings) === 'portrait' &&
    (!supported?.resizeMode || actualRatio <= 9 / 16 + 0.02)) return settings
  if (!supported?.resizeMode) return settings
  const constraints: MediaTrackConstraints = {
    ...mediaTrack.getConstraints(),
    width: { ideal: 720, max: PORTRAIT_LIVE_CAPTURE.width },
    height: { ideal: 1280, max: PORTRAIT_LIVE_CAPTURE.height },
    aspectRatio: { exact: 9 / 16 },
    frameRate: { ideal: PORTRAIT_LIVE_CAPTURE.frameRate, max: PORTRAIT_LIVE_CAPTURE.frameRate },
  }
  if (supported?.resizeMode) {
    ;(constraints as MediaTrackConstraints & { resizeMode: string }).resizeMode = 'none'
  }

  if (supported?.resizeMode) {
    try {
      await mediaTrack.applyConstraints(constraints)
      settings = mediaTrack.getSettings()
      if (trackVideoOrientation(settings) === 'portrait') return settings
    } catch { /* The sensor may not have an uncropped 9:16 mode. */ }
  }
  try {
    await mediaTrack.applyConstraints({
      ...constraints,
      width: { ideal: PORTRAIT_LIVE_CAPTURE.width, max: PORTRAIT_LIVE_CAPTURE.width },
      aspectRatio: { exact: PORTRAIT_LIVE_CAPTURE.aspectRatio },
    })
    settings = mediaTrack.getSettings()
  } catch { /* Keep the original full frame if neither native mode is available. */ }
  return settings
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
    if (orientation === 'portrait') selected = await ensurePortraitCameraTrack(track.mediaStreamTrack)

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
