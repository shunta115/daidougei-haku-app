import { beforeEach, describe, expect, it, vi } from 'vitest'

const liveKit = vi.hoisted(() => ({
  listParticipants: vi.fn(),
  removeParticipant: vi.fn(),
  deleteRoom: vi.fn(),
}))

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {},
  RoomServiceClient: class {
    listParticipants = liveKit.listParticipants
    removeParticipant = liveKit.removeParticipant
    deleteRoom = liveKit.deleteRoom
  },
}))

import { closeSessionRoom } from '../api/livekit/_close'
import { previewRoomNameForPerformer, roomNameForSession } from '../api/livekit/_shared'

describe('LIVE session room isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LIVEKIT_URL = 'wss://test.livekit.cloud'
    process.env.LIVEKIT_API_KEY = 'test-key'
    process.env.LIVEKIT_API_SECRET = 'test-secret'
    liveKit.listParticipants.mockResolvedValue([{ identity: 'host-1' }, { identity: 'viewer-1' }])
    liveKit.removeParticipant.mockResolvedValue(undefined)
    liveKit.deleteRoom.mockResolvedValue(undefined)
  })

  it('never reuses a prior broadcast room for a new session or preview', () => {
    const first = roomNameForSession('host-1', 'session-a')
    const next = roomNameForSession('host-1', 'session-b')
    expect(first).not.toBe(next)
    expect(previewRoomNameForPerformer('host-1')).not.toBe(first)
    expect(previewRoomNameForPerformer('host-1')).not.toBe(next)
  })

  it('revokes connected identities and deletes only the ended session room', async () => {
    const room = roomNameForSession('host-1', 'session-a')
    await closeSessionRoom('host-1', 'session-a')
    expect(liveKit.listParticipants).toHaveBeenCalledWith(room)
    expect(liveKit.removeParticipant).toHaveBeenCalledTimes(2)
    expect(liveKit.removeParticipant).toHaveBeenCalledWith(room, 'host-1', expect.objectContaining({ revokeTokenTs: expect.any(BigInt) }))
    expect(liveKit.removeParticipant).toHaveBeenCalledWith(room, 'viewer-1', expect.objectContaining({ revokeTokenTs: expect.any(BigInt) }))
    expect(liveKit.deleteRoom).toHaveBeenCalledWith(room)
  })

  it('still attempts host revocation if the room has no participants', async () => {
    liveKit.listParticipants.mockRejectedValueOnce(new Error('room unavailable'))
    await closeSessionRoom('host-1', 'session-a')
    expect(liveKit.removeParticipant).toHaveBeenCalledWith(
      roomNameForSession('host-1', 'session-a'), 'host-1', expect.any(Object),
    )
  })

  it('reports unconfirmed revocation even after the room is deleted', async () => {
    liveKit.removeParticipant.mockRejectedValueOnce(new Error('revocation unavailable'))
    await expect(closeSessionRoom('host-1', 'session-a')).rejects.toThrow('could not be confirmed')
    expect(liveKit.deleteRoom).toHaveBeenCalled()
  })
})
