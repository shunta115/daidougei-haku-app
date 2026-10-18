import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canAccessPrivateTestLive } from '../api/livekit/_privacy'

const read = (path: string) => readFileSync(path, 'utf8')

describe('private Test Performer LIVE', () => {
  it('allows only the performer owner, an authorized admin, or the session allowlist', () => {
    expect(canAccessPrivateTestLive(null, 'test-performer', false, true)).toBe(false)
    expect(canAccessPrivateTestLive('fan', 'test-performer', false, false)).toBe(false)
    expect(canAccessPrivateTestLive('other-performer', 'test-performer', false, false)).toBe(false)
    expect(canAccessPrivateTestLive('test-performer', 'test-performer', false, false)).toBe(true)
    expect(canAccessPrivateTestLive('admin', 'test-performer', true, false)).toBe(true)
    expect(canAccessPrivateTestLive('approved-fan', 'test-performer', false, true)).toBe(true)
  })

  it('keeps ordinary approved LIVE guest viewing unchanged', () => {
    const token = read('api/livekit/token.ts')
    expect(token).toMatch(/else if \(!performer\.is_approved \|\| !performer\.is_live\)/)
    expect(token).toMatch(/privateTest && !canAccessPrivateTestLive/)
    expect(token).toMatch(/live_session_viewer_allowlist/)
    expect(token).toMatch(/viewerProfile\?\.role === 'fan'/)
    expect(token).toMatch(/ttl: privateTest \? '15m' : undefined/)
  })

  it('uses a session allowlist without exposing it through the Data API', () => {
    const sql = read('supabase/migrations/20261018102007_private_live_viewer_allowlist.sql')
    expect(sql).toMatch(/create table public\.live_session_viewer_allowlist/i)
    expect(sql).toMatch(/primary key \(session_id, viewer_user_id\)/i)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/revoke all on table public\.live_session_viewer_allowlist from anon, authenticated/i)
    expect(sql).toMatch(/1c21f421-5561-4213-8759-962873accfa0/i)
    expect(sql).toMatch(/29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1/i)
    expect(sql).toMatch(/can_view_live_session/i)
  })

  it('uses an explicit DB flag and protects it with RLS', () => {
    const sql = read('supabase/migrations/20261007_private_test_live.sql')
    expect(sql).toMatch(/add column if not exists is_private_test boolean not null default false/i)
    expect(sql).toMatch(/new\.is_private_test is distinct from old\.is_private_test/i)
    expect(sql).toMatch(/is_approved = true and is_private_test = false/i)
    expect(sql).toMatch(/alter policy live_sessions_read/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table|drop\s+column/i)
  })

  it('revokes private identities and deletes the LiveKit room on end', () => {
    const presence = read('api/livekit/presence.ts')
    expect(presence).toMatch(/removeParticipant\(room, identity, \{ revokeTokenTs \}\)/)
    expect(presence).toMatch(/deleteRoom\(room\)/)
    expect(presence).toMatch(/ended_reason: 'private_test_ended'/)
    expect(presence).toMatch(/live_session_viewer_allowlist/)
    expect(presence).toMatch(/private-viewer-\$\{viewer\.viewer_user_id\}/)
  })

  it('filters the explicit flag from every public performer collection', () => {
    const api = read('src/platform/lib/api.ts')
    expect(api).toMatch(/p\.is_private_test === true/)
    expect(api.match(/!isPrivateTestPerformer/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(api).toMatch(/RLS exposes a private performer only while/)
    expect(api).toMatch(/performerRow\?\.is_private_test !== true/)
    expect(api).toMatch(/broadcastEnabled === false/)
  })
})
