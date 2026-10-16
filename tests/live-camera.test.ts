import { afterEach, describe, expect, it, vi } from 'vitest'
import { Track, type Room } from 'livekit-client'
import { canSwitchHostCamera, switchHostCamera } from '../src/platform/lib/liveCamera'

function fixture(facing: 'user' | 'environment' = 'user', cameraCount = 2) {
  let settings: MediaTrackSettings = { facingMode: facing, deviceId: facing, width: 720, height: 1280, frameRate: 30 }
  const track = {
    isMuted: false,
    mediaStreamTrack: { getSettings: () => settings },
    restartTrack: vi.fn(async (options) => {
      settings = { ...settings, facingMode: options.facingMode, deviceId: options.facingMode }
    }),
  }
  const room = {
    disconnect: vi.fn(),
    localParticipant: {
      getTrackPublication: vi.fn((source) => source === Track.Source.Camera ? { track } : undefined),
      setMicrophoneEnabled: vi.fn(),
      unpublishTrack: vi.fn(),
    },
  }
  vi.stubGlobal('navigator', { mediaDevices: {
    enumerateDevices: vi.fn(async () => Array.from({ length: cameraCount }, (_, i) => ({ kind: 'videoinput', deviceId: String(i) }))),
  } })
  return { track, room, typedRoom: room as unknown as Room }
}

afterEach(() => vi.unstubAllGlobals())

describe('LIVE camera switch', () => {
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
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(room.localParticipant.unpublishTrack).not.toHaveBeenCalled()
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
})
