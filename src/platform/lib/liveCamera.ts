import { Track, type LocalVideoTrack, type Room, type VideoCaptureOptions } from 'livekit-client'

export type CameraFacing = 'user' | 'environment'

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
  const capture: VideoCaptureOptions = {
    resolution: previous.width && previous.height ? {
      width: previous.width,
      height: previous.height,
      frameRate: previous.frameRate ?? 30,
      aspectRatio: previous.aspectRatio ?? previous.width / previous.height,
    } : undefined,
  }

  try {
    // LiveKit updates the existing publication/sender. Audio and the Room remain intact.
    await track.restartTrack({ ...capture, facingMode: next })
    const selected = track.mediaStreamTrack.getSettings()
    if (
      (selected.facingMode && selected.facingMode !== next) ||
      (!selected.facingMode && previous.deviceId && selected.deviceId === previous.deviceId)
    ) {
      throw new Error('requested_camera_unavailable')
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
