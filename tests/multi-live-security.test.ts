import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, safeDestination, validateYouTubeStreamKey } from '../api/multi-live/_security'
import type { DestinationRow } from '../api/multi-live/_security'
import { readFileSync } from 'node:fs'

describe('Multi LIVE server security', () => {
  const originalKey = process.env.MULTI_LIVE_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.MULTI_LIVE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.MULTI_LIVE_ENCRYPTION_KEY
    else process.env.MULTI_LIVE_ENCRYPTION_KEY = originalKey
  })

  it('encrypts stream keys with authenticated encryption', () => {
    const encrypted = encryptSecret({ streamKey: 'abcd-efgh-ijkl' })
    expect(encrypted).not.toContain('abcd-efgh-ijkl')
    expect(decryptSecret(encrypted)).toEqual({ streamKey: 'abcd-efgh-ijkl' })
  })

  it('never returns ingest or OAuth secrets to the browser', () => {
    const row: DestinationRow = {
      performer_id: 'performer', provider: 'youtube', display_name: 'YouTube', visibility: 'public', enabled: true,
      encrypted_ingest: 'encrypted-stream-key', encrypted_oauth: 'encrypted-oauth-token', egress_id: 'EG_123',
      status: 'live', last_error_code: null, updated_at: new Date(0).toISOString(),
    }
    const json = JSON.stringify(safeDestination(row))
    expect(json).not.toContain('encrypted-stream-key')
    expect(json).not.toContain('encrypted-oauth-token')
    expect(json).not.toContain('EG_123')
    expect(JSON.parse(json)).toMatchObject({ configured: true, oauthConnected: true, status: 'live' })
  })

  it.each(['abcd-efgh-ijkl', 'abcd_efgh-1234', '12345678'])('accepts a key-shaped value: %s', (key) => {
    expect(validateYouTubeStreamKey(key)).toBe(true)
  })

  it.each(['short', 'rtmps://a.rtmps.youtube.com/live2/key', 'abc defgh', 'https-key-value'])('rejects unsafe key input: %s', (key) => {
    expect(validateYouTubeStreamKey(key)).toBe(false)
  })

  it('keeps the secret table outside anon and authenticated access', () => {
    const migration = readFileSync(new URL('../supabase/migrations/20261019163855_multi_live_destinations.sql', import.meta.url), 'utf8')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('force row level security')
    expect(migration).toContain('revoke all on table public.multi_live_destinations from anon, authenticated')
    expect(migration).toContain('to service_role')
  })
})
