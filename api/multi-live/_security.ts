import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type DestinationRow = {
  performer_id: string
  provider: 'youtube'
  display_name: string
  visibility: 'public' | 'unlisted' | 'private'
  enabled: boolean
  encrypted_ingest: string
  encrypted_oauth: string | null
  egress_id: string | null
  status: 'ready' | 'starting' | 'live' | 'failed' | 'stopped'
  last_error_code: string | null
  egress_lease_token: string | null
  egress_lease_expires_at: string | null
  egress_stop_requested: boolean
  youtube_broadcast_id: string | null
  actual_visibility: 'public' | 'unlisted' | 'private' | null
  visibility_confirmed_at: string | null
  updated_at: string
}

type SecretEnvelope = { v: 1; iv: string; tag: string; data: string }

function encryptionKey() {
  const raw = process.env.MULTI_LIVE_ENCRYPTION_KEY?.trim().replace(/^['"]|['"]$/g, '') || ''
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('MULTI_LIVE_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex chars)')
  return key
}

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const envelope: SecretEnvelope = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

export function decryptSecret<T>(encoded: string): T {
  const envelope = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as SecretEnvelope
  if (envelope.v !== 1) throw new Error('Unsupported secret envelope')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8')) as T
}

export function safeDestination(row: DestinationRow | null) {
  if (!row) return { provider: 'youtube' as const, configured: false, oauthConnected: false, enabled: false, status: 'unconfigured' as const, visibilityConfirmed: false }
  return {
    provider: 'youtube' as const, configured: true, oauthConnected: Boolean(row.encrypted_oauth),
    displayName: row.display_name, visibility: row.visibility, enabled: row.enabled, status: row.status,
    lastErrorCode: row.last_error_code || undefined, updatedAt: row.updated_at,
    actualVisibility: row.actual_visibility || undefined,
    broadcastId: row.youtube_broadcast_id || undefined,
    visibilityConfirmed: Boolean(row.visibility_confirmed_at && row.youtube_broadcast_id),
  }
}

export function validateYouTubeStreamKey(value: string) {
  return /^[A-Za-z0-9_-]{8,128}(?:-[A-Za-z0-9_-]{2,128})*$/.test(value) && !/(?:https?|rtmps?)/i.test(value)
}

export function randomOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function hashOpaqueToken(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function cookieValue(header: string | undefined, name: string) {
  if (!header) return ''
  for (const pair of header.split(';')) {
    const [key, ...value] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

export function destinationIsLocked(row: Pick<DestinationRow, 'egress_id' | 'egress_lease_expires_at'>, now = Date.now()) {
  return Boolean(row.egress_id || (row.egress_lease_expires_at && new Date(row.egress_lease_expires_at).getTime() > now))
}

export function youtubeStartSafety(input: {
  requestedVisibility: DestinationRow['visibility']
  actualVisibility: DestinationRow['visibility']
  confirmed: boolean
  privateHakuLive: boolean
  lifeCycleStatus: string
}) {
  if (!input.confirmed || input.actualVisibility !== input.requestedVisibility) return 'visibility_unconfirmed' as const
  if (input.privateHakuLive && input.actualVisibility !== 'private') return 'private_haku_requires_private_youtube' as const
  if (!['ready', 'testing', 'live'].includes(input.lifeCycleStatus)) return 'broadcast_not_ready' as const
  return null
}
