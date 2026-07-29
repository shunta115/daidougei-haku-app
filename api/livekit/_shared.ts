import { AccessToken } from 'livekit-server-sdk'

export function getLiveKitConfig() {
  const url = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.')
  }
  return { url, apiKey, apiSecret }
}

export function roomNameForPerformer(performerId: string) {
  return `performer-${performerId}`
}

export async function createLiveKitToken(opts: {
  identity: string
  name: string
  room: string
  canPublish: boolean
}) {
  const { apiKey, apiSecret } = getLiveKitConfig()
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: '6h',
  })
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: opts.canPublish,
    canSubscribe: true,
    canPublishData: true,
  })
  return await at.toJwt()
}
