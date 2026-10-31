import type { Room } from 'livekit-client'
import { hostCameraTrack } from './liveCamera'

type NumericRange = { min: number | null; max: number | null; step: number | null }
type VideoObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
export type SafeVideoSettings = {
  width: number | null
  height: number | null
  aspectRatio: number | null
  frameRate: number | null
  facingMode: string | null
  zoom: number | null
}
export type SafeVideoCapabilities = {
  width: NumericRange | null
  height: NumericRange | null
  aspectRatio: NumericRange | null
  frameRate: NumericRange | null
  zoom: NumericRange | null
}
export type HostVideoDiagnostics = {
  processorActive: boolean
  source: SafeVideoSettings | null
  sourceCapabilities: SafeVideoCapabilities | null
  senderInput: SafeVideoSettings | null
  senderInputCapabilities: SafeVideoCapabilities | null
  encodedLayers: Array<{
    width: number | null
    height: number | null
    framesPerSecond: number | null
    targetBitrateBps: number | null
    qualityLimitationReason: 'none' | 'cpu' | 'bandwidth' | 'other' | null
  }>
  measuredBitrateBps: number | null
  preview: {
    width: number | null
    height: number | null
    elementWidth: number | null
    elementHeight: number | null
    objectFit: VideoObjectFit | null
    elementFilterActive: boolean
  } | null
  warnings: Array<'camera_unavailable' | 'source_settings_unavailable' | 'sender_stats_unavailable' | 'source_capabilities_unavailable'>
}

// Stats stream keys are used only for matching counter samples. They are never
// returned or logged, and disappear when the LocalVideoTrack is collected.
const previousSenderStats = new WeakMap<object, Map<string, { timestampMs: number; bytesSent: number }>>()

function number(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null
}

function settings(value: MediaTrackSettings): SafeVideoSettings {
  const width = number(value.width)
  const height = number(value.height)
  return {
    width,
    height,
    aspectRatio: number(value.aspectRatio) ?? (width && height ? width / height : null),
    frameRate: number(value.frameRate),
    facingMode: ['user', 'environment', 'left', 'right'].includes(value.facingMode ?? '') ? value.facingMode! : null,
    zoom: number((value as MediaTrackSettings & { zoom?: number }).zoom, true),
  }
}

function range(value: unknown): NumericRange | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  return { min: number(input.min, true), max: number(input.max, true), step: number(input.step, true) }
}

function capabilities(track: MediaStreamTrack): SafeVideoCapabilities | null {
  try {
    if (typeof track.getCapabilities !== 'function') return null
    const input = track.getCapabilities() as MediaTrackCapabilities & { zoom?: unknown }
    return { width: range(input.width), height: range(input.height), aspectRatio: range(input.aspectRatio), frameRate: range(input.frameRate), zoom: range(input.zoom) }
  } catch { return null }
}

function previewDimensions(video: HTMLVideoElement | null): HostVideoDiagnostics['preview'] {
  if (!video) return null
  let objectFit: VideoObjectFit | null = null
  let elementFilterActive = false
  try {
    const style = getComputedStyle(video)
    if (['contain', 'cover', 'fill', 'none', 'scale-down'].includes(style.objectFit)) objectFit = style.objectFit as VideoObjectFit
    elementFilterActive = Boolean(style.filter && style.filter !== 'none')
  } catch { /* Non-DOM consumers can still read the intrinsic dimensions. */ }
  return { width: number(video.videoWidth), height: number(video.videoHeight), elementWidth: number(video.clientWidth), elementHeight: number(video.clientHeight), objectFit, elementFilterActive }
}

/**
 * Reads numeric diagnostics without changing capture, processors or publishing.
 * LiveKit mediaStreamTrack points at the processed track when a processor is
 * installed. getSourceTrackSettings is therefore required for the camera row.
 * IDs, device labels, SDP and raw RTC stats are deliberately never returned.
 */
export async function readHostVideoDiagnostics(
  room: Room | null,
  previewVideo: HTMLVideoElement | null,
): Promise<HostVideoDiagnostics> {
  const result: HostVideoDiagnostics = {
    processorActive: false, source: null, sourceCapabilities: null, senderInput: null, senderInputCapabilities: null,
    encodedLayers: [], measuredBitrateBps: null, preview: previewDimensions(previewVideo), warnings: [],
  }
  const track = room ? hostCameraTrack(room) : undefined
  if (!track) { result.warnings.push('camera_unavailable'); return result }
  result.processorActive = Boolean(track.getProcessor()?.processedTrack)
  try { result.source = settings(track.getSourceTrackSettings()) } catch { result.warnings.push('source_settings_unavailable') }
  try { result.senderInput = settings(track.mediaStreamTrack.getSettings()) } catch { /* An ended input can temporarily lack settings. */ }
  result.senderInputCapabilities = capabilities(track.mediaStreamTrack)
  if (!result.processorActive) result.sourceCapabilities = result.senderInputCapabilities
  else result.warnings.push('source_capabilities_unavailable')
  try {
    const stats = await track.getSenderStats()
    result.encodedLayers = stats.map((row) => ({
      width: number(row.frameWidth), height: number(row.frameHeight), framesPerSecond: number(row.framesPerSecond, true),
      targetBitrateBps: number(row.targetBitrate, true),
      qualityLimitationReason: ['none', 'cpu', 'bandwidth', 'other'].includes(row.qualityLimitationReason ?? '') ? row.qualityLimitationReason as 'none' | 'cpu' | 'bandwidth' | 'other' : null,
    }))
    const previous = previousSenderStats.get(track)
    const next = new Map<string, { timestampMs: number; bytesSent: number }>()
    let measuredBitrateBps = 0
    let matched = 0
    for (const row of stats) {
      const timestampMs = number(row.timestamp, true)
      const bytesSent = number(row.bytesSent, true)
      if (timestampMs == null || bytesSent == null) continue
      const key = row.streamId ?? row.rid
      const before = previous?.get(key)
      next.set(key, { timestampMs, bytesSent })
      if (before && timestampMs > before.timestampMs && bytesSent >= before.bytesSent) {
        measuredBitrateBps += (bytesSent - before.bytesSent) * 8_000 / (timestampMs - before.timestampMs)
        matched += 1
      }
    }
    previousSenderStats.set(track, next)
    if (matched) result.measuredBitrateBps = Math.round(measuredBitrateBps)
  } catch { result.warnings.push('sender_stats_unavailable') }
  return result
}
