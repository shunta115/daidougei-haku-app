import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  VideoPreset,
  VideoPresets,
  VideoQuality,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type VideoCodec,
} from 'livekit-client'
import { supabase } from './supabase'

export type LiveKitErrorKind = 'not_configured' | 'auth' | 'connection' | 'unknown'

export class LiveKitClientError extends Error {
  kind: LiveKitErrorKind
  constructor(kind: LiveKitErrorKind, message: string) {
    super(message)
    this.name = 'LiveKitClientError'
    this.kind = kind
  }
}

export function liveKitErrorMessage(kind: LiveKitErrorKind, detail?: string) {
  switch (kind) {
    case 'not_configured':
      return 'LiveKit未設定です。サーバーの LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET を確認してください'
    case 'auth':
      return detail || '認証失敗です。ログインし直してから再度お試しください'
    case 'connection':
      return detail || '接続失敗です。通信環境を確認して再度お試しください'
    default:
      return detail || 'ライブ接続に失敗しました'
  }
}

/** Soft hint only — connection URL always comes from the token API (server-side). */
export function isLiveKitConfigured() {
  return true
}

export function liveRoomName(performerId: string) {
  return `performer-${performerId}`
}

/** ~480p 16:9 layer for weak-network simulcast. */
const VideoPreset480p = new VideoPreset(854, 480, 900_000, 30)

const CAPTURE_1080P30 = {
  width: 1920,
  height: 1080,
  frameRate: 30,
  aspectRatio: 16 / 9,
} as const

function isMobileUa() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function isSafariUa() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|FxiOS|OPiOS/i.test(ua)
}

/** Prefer H.264 on iOS Safari for hardware encode/decode + battery. */
function preferredVideoCodec(): VideoCodec {
  return isSafariUa() ? 'h264' : 'vp8'
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function classifyTokenFailure(status: number, errorText: string): LiveKitClientError {
  const lower = errorText.toLowerCase()
  if (
    status === 500 &&
    (lower.includes('not configured') || lower.includes('livekit is not configured') || lower.includes('livekit_url'))
  ) {
    return new LiveKitClientError('not_configured', liveKitErrorMessage('not_configured'))
  }
  if (status === 401 || status === 403) {
    return new LiveKitClientError('auth', liveKitErrorMessage('auth', errorText || undefined))
  }
  if (status === 404 || status === 400) {
    return new LiveKitClientError('unknown', errorText || liveKitErrorMessage('unknown'))
  }
  if (status >= 500) {
    return new LiveKitClientError('connection', liveKitErrorMessage('connection', errorText || undefined))
  }
  return new LiveKitClientError('unknown', errorText || liveKitErrorMessage('unknown'))
}

export async function fetchLiveKitStatus() {
  try {
    const res = await fetch('/api/livekit/status')
    if (!res.ok) return { configured: false as const }
    return (await res.json()) as { configured: boolean; hasUrl?: boolean; hasKey?: boolean; hasSecret?: boolean }
  } catch {
    return { configured: false as const }
  }
}

export async function fetchLiveKitToken(performerId: string, asHost: boolean) {
  let res: Response
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    }
    res = await fetch('/api/livekit/token', {
      method: 'POST',
      headers,
      body: JSON.stringify({ performerId, asHost }),
    })
  } catch {
    throw new LiveKitClientError('connection', liveKitErrorMessage('connection', 'トークンAPIに到達できませんでした'))
  }

  let json: { token?: string; url?: string; room?: string; error?: string } = {}
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new LiveKitClientError('connection', liveKitErrorMessage('connection', 'トークンAPIの応答が不正です'))
  }

  if (!res.ok || !json.token || !json.url) {
    throw classifyTokenFailure(res.status, json.error || '')
  }
  return json as { token: string; url: string; room: string }
}

function hostRoomOptions() {
  const mobile = isMobileUa()
  return {
    // SFU selects layers per subscriber; unused layers pause → CPU/battery save on host.
    adaptiveStream: true as const,
    dynacast: true as const,
    stopLocalTrackOnUnpublish: true,
    disconnectOnPageLeave: true,
    videoCaptureDefaults: {
      resolution: CAPTURE_1080P30,
      facingMode: 'user' as const,
    },
    audioCaptureDefaults: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
    publishDefaults: {
      // Primary = 1080p30; extra layers = 480p + 720p for auto step-down.
      videoEncoding: {
        maxBitrate: mobile ? 2_500_000 : VideoPresets.h1080.encoding.maxBitrate,
        maxFramerate: 30,
      },
      videoSimulcastLayers: [VideoPreset480p, VideoPresets.h720],
      simulcast: true,
      videoCodec: preferredVideoCodec(),
      backupCodec: true,
      degradationPreference: 'maintain-framerate' as const,
      dtx: true,
      red: true,
      forceStereo: false,
      stopMicTrackOnMute: false,
    },
  }
}

function viewerRoomOptions() {
  return {
    // Cap pixel density on mobile/retina to cut decode cost & battery.
    adaptiveStream: {
      pixelDensity: isMobileUa() ? 1 : ('screen' as const),
    },
    dynacast: true as const,
    disconnectOnPageLeave: true,
  }
}

export async function connectAsHost(url: string, token: string) {
  const room = new Room(hostRoomOptions())
  try {
    await room.connect(url, token, { autoSubscribe: true })
    await room.localParticipant.setMicrophoneEnabled(true)
    await room.localParticipant.setCameraEnabled(true, {
      resolution: CAPTURE_1080P30,
      facingMode: 'user',
    })
  } catch (e) {
    try {
      await room.disconnect()
    } catch {
      /* ignore */
    }
    const detail = e instanceof Error ? e.message : undefined
    throw new LiveKitClientError('connection', liveKitErrorMessage('connection', detail))
  }
  return room
}

export async function connectAsViewer(url: string, token: string) {
  const room = new Room(viewerRoomOptions())
  try {
    await room.connect(url, token, { autoSubscribe: true })
  } catch (e) {
    try {
      await room.disconnect()
    } catch {
      /* ignore */
    }
    const detail = e instanceof Error ? e.message : undefined
    throw new LiveKitClientError('connection', liveKitErrorMessage('connection', detail))
  }
  return room
}

export function attachRemoteTrack(
  track: RemoteTrack,
  videoEl: HTMLVideoElement | null,
  audioEl: HTMLAudioElement | null,
) {
  if (track.kind === Track.Kind.Video && videoEl) {
    track.attach(videoEl)
    videoEl.playsInline = true
    videoEl.setAttribute('playsinline', 'true')
    videoEl.muted = true // autoplay policies; audio comes from dedicated <audio>
    void videoEl.play().catch(() => undefined)
  }
  if (track.kind === Track.Kind.Audio && audioEl) {
    track.attach(audioEl)
    void audioEl.play().catch(() => undefined)
  }
}

export type LiveQualityLabel = '1080p' | '720p' | '480p' | 'AUDIO+' | 'AUTO'

/**
 * Network-aware quality:
 * - Good/Excellent → up to 1080p (adaptiveStream)
 * - Poor → cap 720p
 * - Lost → cap 480p, keep audio; only drop video if still Lost after soft cap
 * Dynacast + simulcast on the host supply the matching layers.
 */
export function applyNetworkAdaptation(room: Room, quality: ConnectionQuality): LiveQualityLabel {
  let label: LiveQualityLabel = 'AUTO'
  let maxQuality = VideoQuality.HIGH
  let dimensions: { width: number; height: number } | null = null
  let dropVideo = false

  switch (quality) {
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Good:
      maxQuality = VideoQuality.HIGH
      label = '1080p'
      break
    case ConnectionQuality.Poor:
      maxQuality = VideoQuality.MEDIUM
      dimensions = { width: 1280, height: 720 }
      label = '720p'
      break
    case ConnectionQuality.Lost:
      maxQuality = VideoQuality.LOW
      dimensions = { width: 854, height: 480 }
      label = '480p'
      break
    default:
      maxQuality = VideoQuality.HIGH
      label = 'AUTO'
  }

  // Publisher: stop encoding unused high layers when uplink is weak (CPU/battery + bandwidth).
  for (const pub of room.localParticipant.videoTrackPublications.values()) {
    const track = pub.track
    if (track && 'setPublishingQuality' in track && typeof track.setPublishingQuality === 'function') {
      track.setPublishingQuality(maxQuality)
    }
  }

  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video) continue
      if (dropVideo) {
        if (pub.isSubscribed) void pub.setSubscribed(false)
        continue
      }
      if (!pub.isSubscribed) void pub.setSubscribed(true)
      if (dimensions) pub.setVideoDimensions(dimensions)
      else pub.setVideoQuality(maxQuality)
    }
  }

  if (quality === ConnectionQuality.Lost) {
    // Soft 480p first; if remote still marks Lost, prefer audio continuity.
    label = '480p'
  }

  return label
}

/** @deprecated Prefer applyNetworkAdaptation — kept for call-site compatibility. */
export function preferAudioOnWeakNetwork(room: Room, weak: boolean) {
  applyNetworkAdaptation(room, weak ? ConnectionQuality.Poor : ConnectionQuality.Good)
}

export function preferAudioOnly(room: Room) {
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video) continue
      if (pub.isSubscribed) void pub.setSubscribed(false)
    }
  }
}

export function countViewers(room: Room) {
  return room.numParticipants
}

export function watchRemoteMedia(
  room: Room,
  onTrack: (track: RemoteTrack, participant: RemoteParticipant, publication: RemoteTrackPublication) => void,
) {
  const handle = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    onTrack(track, participant, publication)
  }
  room.on(RoomEvent.TrackSubscribed, handle)
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.track && pub.isSubscribed) onTrack(pub.track, p, pub)
    }
  }
  return () => {
    room.off(RoomEvent.TrackSubscribed, handle)
  }
}

export type { Room }
