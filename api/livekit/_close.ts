import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, roomNameForSession } from './_shared.js'

/** Close only this broadcast's room; a later session always has a different name. */
export async function closeSessionRoom(performerId: string, sessionId: string) {
  const { url, apiKey, apiSecret } = getLiveKitConfig()
  const client = new RoomServiceClient(url, apiKey, apiSecret)
  const room = roomNameForSession(performerId, sessionId)
  let identities = [performerId]
  try {
    const participants = await client.listParticipants(room)
    identities = [...new Set([performerId, ...participants.map((participant) => participant.identity)])]
  } catch {
    // The room may already be gone. Still revoke the known host identity.
  }
  const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 1)
  const revoked = await Promise.allSettled(
    identities.map((identity) => client.removeParticipant(room, identity, { revokeTokenTs })),
  )
  let deleteFailed = false
  try {
    await client.deleteRoom(room)
  } catch (error) {
    const code = (error as { code?: string })?.code
    const message = error instanceof Error ? error.message : ''
    deleteFailed = code !== 'not_found' && !/not.?found|does not exist/i.test(message)
  }
  if (revoked.some((result) => result.status === 'rejected') || deleteFailed) {
    throw new Error('LiveKit session close could not be confirmed')
  }
  return { revoked: revoked.length }
}
