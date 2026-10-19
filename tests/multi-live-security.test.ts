import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cookieValue, decryptSecret, destinationIsLocked, encryptSecret, hashOpaqueToken, randomOpaqueToken, safeDestination, validateYouTubeStreamKey, youtubeStartSafety } from '../api/multi-live/_security'
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
      status: 'live', last_error_code: null, egress_lease_token: null, egress_lease_expires_at: null,
      egress_stop_requested: false, youtube_broadcast_id: 'broadcast', actual_visibility: 'public',
      visibility_confirmed_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
    }
    const json = JSON.stringify(safeDestination(row))
    expect(json).not.toContain('encrypted-stream-key')
    expect(json).not.toContain('encrypted-oauth-token')
    expect(json).not.toContain('EG_123')
    expect(JSON.parse(json)).toMatchObject({ configured: true, oauthConnected: true, status: 'live' })
  })

  it('uses high-entropy opaque OAuth state and irreversible hashes', () => {
    const token = randomOpaqueToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(hashOpaqueToken(token)).toMatch(/^[a-f\d]{64}$/)
    expect(hashOpaqueToken(token)).not.toContain(token)
  })

  it('reads only the exact HttpOnly OAuth browser binding cookie', () => {
    expect(cookieValue('session=other; haku_multi_live_oauth=bound%2Dvalue; suffix=x', 'haku_multi_live_oauth')).toBe('bound-value')
    expect(cookieValue('haku_multi_live_oauth_evil=value', 'haku_multi_live_oauth')).toBe('')
  })

  it('locks destination mutation for active Egress and unexpired startup leases', () => {
    expect(destinationIsLocked({ egress_id: 'EG_1', egress_lease_expires_at: null })).toBe(true)
    expect(destinationIsLocked({ egress_id: null, egress_lease_expires_at: new Date(20_000).toISOString() }, 10_000)).toBe(true)
    expect(destinationIsLocked({ egress_id: null, egress_lease_expires_at: new Date(5_000).toISOString() }, 10_000)).toBe(false)
  })

  it('requires actual visibility confirmation and keeps private HAKU private on YouTube', () => {
    expect(youtubeStartSafety({ requestedVisibility: 'public', actualVisibility: 'unlisted', confirmed: true, privateHakuLive: false, lifeCycleStatus: 'ready' })).toBe('visibility_unconfirmed')
    expect(youtubeStartSafety({ requestedVisibility: 'public', actualVisibility: 'public', confirmed: true, privateHakuLive: true, lifeCycleStatus: 'ready' })).toBe('private_haku_requires_private_youtube')
    expect(youtubeStartSafety({ requestedVisibility: 'private', actualVisibility: 'private', confirmed: true, privateHakuLive: true, lifeCycleStatus: 'ready' })).toBeNull()
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

  it('keeps private HAKU viewers authenticated and assigned', () => {
    const tokenApi = readFileSync(new URL('../api/livekit/token.ts', import.meta.url), 'utf8')
    expect(tokenApi).toContain("select('id, stage_name, is_approved, is_live, is_private_test')")
    expect(tokenApi).toContain('if (!user)')
    expect(tokenApi).toContain("sb.rpc('can_navigate_live'")
    expect(tokenApi).toContain('accessError || allowed !== true')
  })

  it('reaps external Egress after an inactive or force-closed HAKU session', () => {
    const presenceApi = readFileSync(new URL('../api/livekit/presence.ts', import.meta.url), 'utf8')
    expect(presenceApi).toContain('reapInactiveMultiLiveEgresses')
    expect(presenceApi).toContain('await client.stopEgress(target.egress_id)')
    expect(presenceApi).toContain(".eq('is_live', false)")
  })

  it('keeps HAKU live on external start failure and stops Egress during normal end', () => {
    const screen = readFileSync(new URL('../src/platform/screens/PerformerLiveScreen.tsx', import.meta.url), 'utf8')
    expect(screen).toMatch(/void startMultiLiveEgress\(\)[\s\S]*\.catch\(\(\) => setMultiLiveStatus/)
    expect(screen).toMatch(/if \(multiLiveStatus\?\.configured\)[\s\S]*await stopMultiLiveEgress\(\)[\s\S]*await endLive/)
  })
})
