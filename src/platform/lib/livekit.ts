import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
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

export async function connectAsHost(url: string, token: string) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
    publishDefaults: {
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
      videoCodec: 'vp8',
      dtx: true,
      red: true,
    },
  })
  try {
    await room.connect(url, token)
    await room.localParticipant.setMicrophoneEnabled(true)
    await room.localParticipant.setCameraEnabled(true)
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
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  })
  try {
    await room.connect(url, token)
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
  if (track.kind === Track.Kind.Video && videoEl) track.attach(videoEl)
  if (track.kind === Track.Kind.Audio && audioEl) track.attach(audioEl)
}

/** Prefer audio continuity: on weak networks, unsubscribe video and keep audio. */
export function preferAudioOnWeakNetwork(room: Room, weak: boolean) {
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind !== Track.Kind.Video) continue
      if (weak && pub.isSubscribed) void pub.setSubscribed(false)
      if (!weak && !pub.isSubscribed) void pub.setSubscribed(true)
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
