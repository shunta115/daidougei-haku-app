import { describe, it, expect } from 'vitest'
// @ts-expect-error Node-only experiment deliberately does not join production TS bundle.
import { makeAuthority } from '../experiments/free-live/policy.mjs'
// @ts-expect-error Node-only read-only adapter.
import { authenticateHaku } from '../experiments/free-live/haku-auth.mjs'

const owner = { id: 'performer', role: 'performer', approved: true, active: true }
const fan = (i = 1) => ({ id: `fan-${i}`, role: 'fan', active: true })
function fixture(limits = {}) {
  let time = Date.UTC(2026, 9, 27), seq = 0
  const a = makeAuthority({ now: () => time, id: () => `id-${++seq}`, limits })
  const room = a.create(owner)
  const begin = () => { const grant = a.direct(owner, room.id, 'host-peer'); return a.claim(owner, room.id, 'host-peer', grant.nonce, grant.epoch) }
  return { a, room, begin, advance: (ms: number) => { time += ms; a.tick() } }
}
describe('free LIVE authority: permission, concurrency and expiry', () => {
  it('only an approved active performer creates a room', () => {
    const { a } = fixture()
    for (const actor of [null, fan(), { ...owner, approved: false }, { ...owner, active: false }]) expect(() => a.create(actor)).toThrow()
  })
  it('does not allow two active rooms for the same performer', () => {
    const { a } = fixture(); expect(() => a.create(owner)).toThrow('already_has_room')
  })
  it('requires owner consent before issuing QR or audience publish', () => {
    const { a, room } = fixture()
    expect(() => a.qr(owner, room.id)).toThrow('performer_consent_required')
    expect(() => a.consent(fan(), room.id, true)).toThrow('performer_only')
    expect(() => a.request(fan(), room.id, 'fan-peer', 'forged', true)).toThrow('invalid_or_expired_qr')
  })
  it('binds one-use grants to user, device, nonce and epoch', () => {
    const { a, room } = fixture(); const g = a.direct(owner, room.id, 'host-peer')
    for (const args of [ [fan(), 'host-peer', g.nonce, g.epoch], [owner, 'other-peer', g.nonce, g.epoch], [owner, 'host-peer', 'forged', g.epoch], [owner, 'host-peer', g.nonce, g.epoch + 1] ]) {
      expect(() => a.claim(args[0], room.id, ...args.slice(1))).toThrow('publish_grant_invalid')
    }
    a.claim(owner, room.id, 'host-peer', g.nonce, g.epoch)
    expect(() => a.claim(owner, room.id, 'host-peer', g.nonce, g.epoch)).toThrow('publish_grant_invalid')
  })
  it('accepts exactly five viewers and frees slots on leave', () => {
    const { a, room, begin } = fixture(); begin()
    for (let i = 1; i <= 5; i++) a.join(fan(i), room.id, `viewer-${i}`)
    expect(() => a.join(fan(6), room.id, 'viewer-6')).toThrow('viewer_limit')
    a.leave(fan(1), room.id, 'viewer-1'); expect(a.join(fan(6), room.id, 'viewer-6').viewers).toBe(5)
  })
  it('does not let another user take an existing peer identity', () => {
    const { a, room } = fixture(); a.join(fan(), room.id, 'viewer-1')
    expect(() => a.join(fan(2), room.id, 'viewer-1')).toThrow('peer_identity_mismatch')
  })
  it('allows viewer-to-publisher answer but rejects publication and viewer-to-viewer messages', () => {
    const { a, room, begin } = fixture(); const state = begin(); a.join(fan(), room.id, 'viewer-1'); a.join(fan(2), room.id, 'viewer-2')
    expect(a.authorizeSignal(fan(), room.id, 'viewer-1', 'host-peer', state.epoch, 'answer')).toBe(true)
    expect(() => a.authorizeSignal(fan(), room.id, 'viewer-1', 'host-peer', state.epoch, 'offer')).toThrow('signal_forbidden')
    expect(() => a.authorizeSignal(fan(), room.id, 'viewer-1', 'viewer-2', state.epoch, 'candidate')).toThrow('signal_forbidden')
    expect(() => a.authorizeSignal(fan(2), room.id, 'viewer-1', 'host-peer', state.epoch, 'answer')).toThrow('signal_forbidden')
  })
  it('invalidates a QR when rotated or expired', () => {
    const { a, room, advance } = fixture(); a.consent(owner, room.id, true)
    const first = a.qr(owner, room.id); const second = a.qr(owner, room.id)
    expect(() => a.request(fan(), room.id, 'fan-peer', first.token, true)).toThrow('invalid_or_expired_qr')
    advance(300_001)
    expect(() => a.request(fan(), room.id, 'fan-peer', second.token, true)).toThrow('invalid_or_expired_qr')
  })
  it('requires audience acknowledgement of privacy and phone data use', () => {
    const { a, room } = fixture(); a.consent(owner, room.id, true); const qr = a.qr(owner, room.id)
    expect(() => a.request(fan(), room.id, 'fan-peer', qr.token, false)).toThrow('privacy_consent_required')
  })
  it('hands off with break-before-make and revokes the old publisher', () => {
    const { a, room, begin } = fixture(); const old = begin()
    a.consent(owner, room.id, true); const qr = a.qr(owner, room.id)
    expect(a.request(fan(), room.id, 'next-peer', qr.token, true)).toEqual({ queued: true })
    a.handoff(owner, room.id, 'next-peer')
    expect(a.pendingGrant(fan(), room.id, 'next-peer')).toBeNull()
    expect(() => a.heartbeat(owner, room.id, 'host-peer', old.epoch)).toThrow('publish_lease_revoked')
    expect(() => a.acknowledgeStop(fan(), room.id, 'host-peer')).toThrow('stop_ack_invalid')
    a.acknowledgeStop(owner, room.id, 'host-peer')
    const g = a.pendingGrant(fan(), room.id, 'next-peer')
    expect(a.claim(fan(), room.id, 'next-peer', g.nonce, g.epoch).publisherId).toBe('fan-1')
    expect(() => a.authorizeSignal(owner, room.id, 'host-peer', 'viewer-1', old.epoch, 'offer')).toThrow('stale_signal')
  })
  it('ends instead of handing off if the old publisher never acknowledges stop', () => {
    const { a, room, begin, advance } = fixture(); begin(); a.consent(owner, room.id, true)
    const qr = a.qr(owner, room.id); a.request(fan(), room.id, 'next-peer', qr.token, true)
    a.handoff(owner, room.id, 'next-peer'); advance(12_001)
    expect(a.state(owner, room.id).reason).toBe('handoff_timeout')
  })
  it('the owner can emergency-stop an audience publisher and all old rights expire', () => {
    const { a, room } = fixture(); a.consent(owner, room.id, true); const qr = a.qr(owner, room.id)
    const g = a.request(fan(), room.id, 'fan-peer', qr.token, true); a.claim(fan(), room.id, 'fan-peer', g.nonce, g.epoch)
    a.stop(owner, room.id)
    expect(() => a.heartbeat(fan(), room.id, 'fan-peer', g.epoch)).toThrow('session_ended')
    expect(() => a.request(fan(2), room.id, 'next-peer', qr.token, true)).toThrow('session_ended')
    expect(() => a.join(fan(2), room.id, 'viewer-2')).toThrow('session_ended')
  })
  it('revoking consent stops an armed or live audience publisher', () => {
    for (const live of [false, true]) {
      const { a, room } = fixture(); a.consent(owner, room.id, true); const qr = a.qr(owner, room.id)
      const g = a.request(fan(), room.id, 'fan-peer', qr.token, true)
      if (live) a.claim(fan(), room.id, 'fan-peer', g.nonce, g.epoch)
      expect(a.consent(owner, room.id, false).reason).toBe('crowd_permission_revoked')
    }
  })
  it('stops on publisher lease expiry and cannot silently resume', () => {
    const { a, room, begin, advance } = fixture(); const old = begin(); advance(12_001)
    expect(a.state(owner, room.id).reason).toBe('publisher_disconnected')
    expect(() => a.heartbeat(owner, room.id, 'host-peer', old.epoch)).toThrow('session_ended')
  })
  it('expires abandoned viewer slots without evicting a renewing publisher', () => {
    const { a, room, begin, advance } = fixture(); const old = begin(); a.join(fan(), room.id, 'viewer-1')
    advance(10_000); a.heartbeat(owner, room.id, 'host-peer', old.epoch)
    advance(10_001); a.heartbeat(owner, room.id, 'host-peer', old.epoch)
    expect(a.state(owner, room.id).viewers).toBe(0)
  })
  it('enforces a global participant-second safety limit', () => {
    const { a, room, begin, advance } = fixture({ dailyParticipantSeconds: 10 }); begin()
    a.join(fan(), room.id, 'viewer-1'); advance(5_001)
    expect(a.state(owner, room.id).reason).toBe('daily_safety_limit')
    expect(() => a.create({ ...owner, id: 'other' })).toThrow('daily_safety_limit')
  })
  it('expires session duration even if a publisher renews', () => {
    const { a, room, begin, advance } = fixture({ roomMs: 4000 }); begin(); advance(4001)
    expect(a.state(owner, room.id).reason).toBe('duration_limit')
  })
  it('quarantines on a valid authenticated report and rejects anonymous reports', () => {
    const { a, room, begin } = fixture(); begin()
    expect(() => a.report(null, room.id, 'unsafe')).toThrow('authentication_required')
    expect(() => a.report(fan(), room.id, 'fake')).toThrow('invalid_report')
    expect(a.report(fan(), room.id, 'privacy').quarantined).toBe(true)
    expect(a.state(owner, room.id).reason).toBe('report_quarantine')
  })
})
describe('read-only HAKU authentication adapter', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  it('ignores editable user_metadata role and approval', async () => {
    const calls: string[] = []
    const actor = await authenticateHaku({ authorization: 'Bearer token', url: 'https://example.supabase.co', publishableKey: 'public-test', fetcher: async (url: URL) => {
      calls.push(String(url))
      const value = url.pathname === '/auth/v1/user' ? { id, user_metadata: { role: 'admin', is_approved: true } } : [{id, role:'fan', status:'active'}]
      return Response.json(value)
    } })
    expect(actor.role).toBe('fan'); expect(actor.approved).toBe(false); expect(calls).toHaveLength(2)
  })
  it('rejects anonymous, inactive and forged sessions', async () => {
    for (const user of [{ id, is_anonymous: true }, { id:'not-uuid' }]) await expect(authenticateHaku({ authorization:'Bearer token', url:'https://example.supabase.co', fetcher: async () => Response.json(user) })).rejects.toThrow()
    await expect(authenticateHaku({authorization:'Bearer token',url:'https://example.supabase.co',fetcher:async () => new Response('',{status:401})})).rejects.toThrow('invalid_session')
    await expect(authenticateHaku({authorization:'Bearer token',url:'https://attacker.example',fetcher:async () => Response.json({id})})).rejects.toThrow('invalid_auth_origin')
  })
})
