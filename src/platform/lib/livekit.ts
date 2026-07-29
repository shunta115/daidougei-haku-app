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

export function isLiveKitConfigured() {
  return Boolean(import.meta.env.VITE_LIVEKIT_URL)
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

export async function fetchLiveKitToken(performerId: string, asHost: boolean) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  }
  const res = await fetch('/api/livekit/token', {
    method: 'POST',
    headers,
    body: JSON.stringify({ performerId, asHost }),
  })
  const json = (await res.json()) as { token?: string; url?: string; room?: string; error?: string }
  if (!res.ok || !json.token || !json.url) {
    throw new Error(json.error || 'Could not get live token')
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
  await room.connect(url, token)
  await room.localParticipant.setMicrophoneEnabled(true)
  await room.localParticipant.setCameraEnabled(true)
  return room
}

export async function connectAsViewer(url: string, token: string) {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  })
  await room.connect(url, token)
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
