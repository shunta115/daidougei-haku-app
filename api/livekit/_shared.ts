import { AccessToken } from 'livekit-server-sdk'

function cleanEnv(value: string | undefined) {
  if (!value) return ''
  return value.trim().replace(/^['"]|['"]$/g, '')
}

export function getLiveKitConfig() {
  // Server-only secrets. Prefer LIVEKIT_URL; VITE_LIVEKIT_URL is a fallback for URL only.
  const url = cleanEnv(process.env.LIVEKIT_URL) || cleanEnv(process.env.VITE_LIVEKIT_URL)
  const apiKey = cleanEnv(process.env.LIVEKIT_API_KEY)
  const apiSecret = cleanEnv(process.env.LIVEKIT_API_SECRET)
  if (!url || !apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.')
  }
  if (url === '[SENSITIVE]' || apiKey === '[SENSITIVE]' || apiSecret === '[SENSITIVE]') {
    throw new Error('LiveKit is not configured. Placeholder env values detected.')
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
