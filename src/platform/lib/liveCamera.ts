import { Track, type LocalVideoTrack, type Room, type VideoCaptureOptions } from 'livekit-client'

export type CameraFacing = 'user' | 'environment'

export const PORTRAIT_LIVE_CAPTURE = {
  width: 720,
  height: 1280,
  frameRate: 30,
  aspectRatio: 9 / 16,
} as const

export type TrackVideoOrientation = 'portrait' | 'landscape' | 'unknown'

export function trackVideoOrientation(settings: MediaTrackSettings): TrackVideoOrientation {
  const ratio = settings.aspectRatio ?? (
    settings.width && settings.height ? settings.width / settings.height : undefined
  )
  if (!ratio) return 'unknown'
  return ratio > 1.05 ? 'landscape' : 'portrait'
}

export function hostCameraTrack(room: Room) {
  return room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined
}

export async function canSwitchHostCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((device) => device.kind === 'videoinput').length > 1
}

export async function switchHostCamera(room: Room, current: CameraFacing): Promise<CameraFacing> {
  const track = hostCameraTrack(room)
  if (!track || track.isMuted) throw new Error('カメラをONにしてから切り替えてください。')
  if (!await canSwitchHostCamera()) {
    throw new Error('この端末では前面・背面カメラを切り替えられません。')
  }

  const previous = track.mediaStreamTrack.getSettings()
  const next = current === 'user' ? 'environment' : 'user'
  // Do not inherit the previous camera's sensor dimensions. On iPhone Safari,
  // the rear camera commonly reports a native landscape size even while the
  // phone is upright. Reusing it makes LiveKit publish a landscape track.
  const capture: VideoCaptureOptions = { resolution: PORTRAIT_LIVE_CAPTURE }

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
    if (trackVideoOrientation(selected) === 'landscape') {
      await track.mediaStreamTrack.applyConstraints({
        width: { ideal: PORTRAIT_LIVE_CAPTURE.width },
        height: { ideal: PORTRAIT_LIVE_CAPTURE.height },
        aspectRatio: { ideal: PORTRAIT_LIVE_CAPTURE.aspectRatio },
        frameRate: { ideal: PORTRAIT_LIVE_CAPTURE.frameRate, max: PORTRAIT_LIVE_CAPTURE.frameRate },
      })
      selected = track.mediaStreamTrack.getSettings()
    }

    // Read width/height/aspectRatio after every switch. Some Safari versions
    // retain sensor-native settings even though the rendered frames are rotated;
    // the portrait stage uses cover as a final display guard in that case.
    if (trackVideoOrientation(selected) === 'landscape') {
      console.warn('[HAKU LIVE] Camera retained landscape settings after portrait constraints', {
        width: selected.width,
        height: selected.height,
        aspectRatio: selected.aspectRatio,
        facingMode: selected.facingMode,
      })
    }
    return next
  } catch {
    try {
      await track.restartTrack({
        ...capture,
        facingMode: current,
        ...(previous.deviceId ? { deviceId: { exact: previous.deviceId } } : {}),
      })
    } catch {
      throw new Error('カメラを切り替えられず、元の映像も復元できませんでした。カメラの許可を確認してください。音声と配信ルームは維持しています。')
    }
    throw new Error('カメラを切り替えられませんでした。元のカメラで配信を継続しています。')
  }
}
