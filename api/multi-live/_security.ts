import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

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
  if (!row) return { provider: 'youtube' as const, configured: false, oauthConnected: false, enabled: false, status: 'unconfigured' as const }
  return {
    provider: 'youtube' as const, configured: true, oauthConnected: Boolean(row.encrypted_oauth),
    displayName: row.display_name, visibility: row.visibility, enabled: row.enabled, status: row.status,
    lastErrorCode: row.last_error_code || undefined, updatedAt: row.updated_at,
  }
}

export function validateYouTubeStreamKey(value: string) {
  return /^[A-Za-z0-9_-]{8,128}(?:-[A-Za-z0-9_-]{2,128})*$/.test(value) && !/(?:https?|rtmps?)/i.test(value)
}

export function createOAuthState(performerId: string) {
  const expires = Date.now() + 10 * 60_000
  const payload = `${performerId}.${expires}.${randomBytes(18).toString('base64url')}`
  const mac = createHmac('sha256', encryptionKey()).update(payload).digest('base64url')
  return Buffer.from(`${payload}.${mac}`).toString('base64url')
}

export function parseOAuthState(state: string) {
  const decoded = Buffer.from(state, 'base64url').toString('utf8')
  const parts = decoded.split('.')
  if (parts.length !== 4) throw new Error('Invalid OAuth state')
  const [performerId, expiresRaw, nonce, receivedMac] = parts
  const payload = `${performerId}.${expiresRaw}.${nonce}`
  const expectedMac = createHmac('sha256', encryptionKey()).update(payload).digest('base64url')
  const received = Buffer.from(receivedMac)
  const expected = Buffer.from(expectedMac)
  if (received.length !== expected.length || !timingSafeEqual(received, expected) || Number(expiresRaw) < Date.now()) throw new Error('Invalid OAuth state')
  return performerId
}
