export type LiveFeverPulse = {
  actorId: string
  count: number
  nonce: string
  liveStartedAt: string
}

export function createLiveFeverId(
  cryptoApi: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto,
) {
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function isLiveFeverPulse(value: unknown): value is LiveFeverPulse {
  if (!value || typeof value !== 'object') return false
  const pulse = value as Partial<LiveFeverPulse>
  return typeof pulse.actorId === 'string' && pulse.actorId.length > 0 && pulse.actorId.length <= 64 &&
    typeof pulse.nonce === 'string' && pulse.nonce.length > 0 && pulse.nonce.length <= 64 &&
    typeof pulse.liveStartedAt === 'string' && Number.isFinite(Date.parse(pulse.liveStartedAt)) &&
    typeof pulse.count === 'number' && Number.isInteger(pulse.count) && pulse.count >= 1 && pulse.count <= 12
}
