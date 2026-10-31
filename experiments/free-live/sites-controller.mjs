import { LivePolicyError, makeAuthority } from './policy.mjs'

// A bounded, owner-private TEST adapter. Never a HAKU authentication service.
export const SITES_LAB_LIMITS = Object.freeze({
  viewers: 5, rooms: 1, queue: 5, roomMs: 15 * 60_000,
  dailyParticipantSeconds: 18_000,
})
const KEY = 'haku-owner-lab-v1'
const REQUEST_CAP = 10_000
const MAX_BODY = 40_000
const MAX_STATE = 750_000
const SESSION_MS = 30 * 60_000
const FIXTURES = [
  { id: 'demo-performer', name: '本人（非公開テスト）' },
  { id: 'demo-fan-1', name: '視聴・観客カメラ（この端末）' },
]
const FAIL = (code, status = 403) => { throw new LivePolicyError(code, status) }
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('')
const response = (status, data) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
} })
const failure = error => response(error instanceof LivePolicyError ? error.status : 503,
  { error: error instanceof LivePolicyError ? error.code : 'lab_unavailable' })
const fresh = () => ({ schema: 1, owner: null, authority: null, sessions: {}, mailboxes: {}, ledger: [], requests: { day: '', used: 0 }, reports: [] })

/** D1 compare-and-swap is the sole authority: no process-local room Map is shared.
 * db is a D1Database, and oai-* identity headers must be injected by Sites dispatch.
 * The deployed Site MUST remain owner-private. No service bypass creates a visitor.
 * @param {Request} request
 * @param {{ db?: {prepare: (...args: any[]) => any, withSession?: (...args: any[]) => any}, now?: () => number, origin?: string }} [options]
 */
export async function handleSitesLiveRequest(request, { db, now = Date.now, origin = new URL(request.url).origin } = {}) {
  try {
    if (!db) FAIL('lab_storage_unavailable', 503)
    if (request.method === 'GET' && new URL(request.url).searchParams.has('health')) {
      await db.prepare('SELECT version FROM haku_live_lab_state WHERE id = ?1').bind(KEY).first()
      return response(200, { ok: true, mode: 'sites-owner-lab', persistent: true, mediaRelay: false, requiresVisitorIdentity: true })
    }
    const visitor = request.headers.get('oai-authenticated-user-id')
    if (!visitor || visitor.length > 200) FAIL('sites_sign_in_required', 401)
    if (request.method === 'GET') return response(200, {
      mode: 'sites-owner-lab', limits: SITES_LAB_LIMITS, fixtures: FIXTURES,
      network: 'p2p-no-turn', persistent: true, requestCap: REQUEST_CAP,
    })
    if (request.method !== 'POST') FAIL('method_not_allowed', 405)
    if (request.headers.get('origin') !== origin) FAIL('cross_origin_forbidden')
    if (request.headers.get('sec-fetch-site') === 'cross-site') FAIL('cross_origin_forbidden')
    if (!request.headers.get('content-type')?.startsWith('application/json')) FAIL('json_post_required', 415)
    const declared = Number(request.headers.get('content-length') || 0)
    if (!Number.isFinite(declared) || declared > MAX_BODY) FAIL('body_too_large', 413)
    const reader = request.body?.getReader()
    const chunks = []; let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > MAX_BODY) { await reader.cancel(); FAIL('body_too_large', 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let body
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { FAIL('invalid_json', 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) FAIL('invalid_request', 400)
    const { action, peerId, roomId, requestId } = body
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(peerId || '')) FAIL('invalid_peer', 400)
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId || '')) FAIL('invalid_request_id', 400)
    const owner = await hash(visitor)
    const bearer = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
    const sessionKey = bearer ? await hash(bearer) : ''
    const fingerprint = await hash(JSON.stringify(body))
    for (let attempt = 0; attempt < 10; attempt++) {
      // Each retry starts at the primary, including when read replication exists.
      const connection = db.withSession ? db.withSession('first-primary') : db
      let row = await connection.prepare('SELECT version, body FROM haku_live_lab_state WHERE id = ?1').bind(KEY).first()
      if (!row) {
        await connection.prepare('INSERT INTO haku_live_lab_state (id, version, body) VALUES (?1, 0, ?2) ON CONFLICT(id) DO NOTHING').bind(KEY, JSON.stringify(fresh())).run()
        row = await connection.prepare('SELECT version, body FROM haku_live_lab_state WHERE id = ?1').bind(KEY).first()
      }
      const state = JSON.parse(row.body), t = now(), day = new Date(t).toISOString().slice(0, 10)
      if (state.schema !== 1) FAIL('invalid_lab_state', 503)
      if (state.owner && state.owner !== owner) FAIL('owner_only')
      if (state.requests.day !== day) state.requests = { day, used: 0 }
      for (const [key, session] of Object.entries(state.sessions)) if (session.until <= t) delete state.sessions[key]
      for (const [key, box] of Object.entries(state.mailboxes)) {
        state.mailboxes[key] = box.filter(message => message.until > t)
        if (!state.mailboxes[key].length) delete state.mailboxes[key]
      }
      state.ledger = state.ledger.filter(entry => entry.until > t).slice(-63)
      state.reports = state.reports.filter(report => report.until > t).slice(-19)
      const session = state.sessions[sessionKey]
      if (action !== 'login' && (!session || session.owner !== owner || session.peerId !== peerId)) FAIL('authentication_required', 401)
      const replay = action !== 'login' && state.ledger.find(entry => entry.key === `${sessionKey}:${requestId}`)
      if (replay) {
        if (replay.fingerprint !== fingerprint) FAIL('request_id_reused', 409)
        const room = state.authority?.rooms.find(([id]) => id === replay.roomId)?.[1]
        if (replay.status < 400 && replay.roomId && !['stop', 'report', 'leave'].includes(action) &&
            (!room || room.phase === 'ended' || room.deadline <= t || room.publisher?.until <= t || room.epoch !== replay.epoch)) FAIL('stale_request', 409)
        return response(replay.status, replay.data)
      }
      if (state.requests.used >= REQUEST_CAP) FAIL('lab_daily_request_limit', 429)
      state.requests.used++; state.owner = owner
      const authority = makeAuthority({ now, limits: SITES_LAB_LIMITS, snapshot: state.authority })
      let status = 200, data
      try {
        authority.tick()
        if (action === 'login') {
          if (!FIXTURES.some(fixture => fixture.id === body.fixtureId)) FAIL('unknown_fixture')
          for (const [key, previous] of Object.entries(state.sessions)) if (previous.peerId === peerId) {
            for (const [id] of authority.snapshot().rooms) {
              const room = authority.state(previous.actor, id)
              if (room.performerId === previous.actor.id || room.publisherPeer === peerId) authority.stop(previous.actor, id, 'test_role_changed')
              else authority.leave(previous.actor, id, peerId)
            }
            delete state.sessions[key]
          }
          if (Object.keys(state.sessions).length >= 20) FAIL('session_capacity', 429)
          const performer = body.fixtureId === 'demo-performer'
          const actor = {
            id: performer ? `performer-${owner.slice(0, 24)}` : `fan-${peerId}`,
            role: performer ? 'performer' : 'fan', approved: performer, active: true,
            name: performer ? '本人（非公開テスト）' : '観客（この端末）', fixtureId: body.fixtureId,
          }
          const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
          state.sessions[await hash(token)] = { actor, peerId, owner, until: t + SESSION_MS }
          data = { actor, token, fixture: true, ownerPrivate: true }
        } else {
          const actor = session.actor
          switch (action) {
            case 'create': data = authority.create(actor); break
            case 'state': data = authority.state(actor, roomId); break
            case 'consent': data = authority.consent(actor, roomId, body.allowed); break
            case 'qr': data = authority.qr(actor, roomId); break
            case 'direct': data = authority.direct(actor, roomId, peerId); break
            case 'request': data = authority.request(actor, roomId, peerId, body.qrToken, body.consent); break
            case 'pending': data = authority.pendingGrant(actor, roomId, peerId); break
            case 'claim': data = authority.claim(actor, roomId, peerId, body.nonce, body.epoch); break
            case 'heartbeat': data = authority.heartbeat(actor, roomId, peerId, body.epoch); break
            case 'join': data = authority.join(actor, roomId, peerId); break
            case 'leave': data = authority.leave(actor, roomId, peerId); break
            case 'handoff': data = authority.handoff(actor, roomId, body.nextPeer); break
            case 'stopped': data = authority.acknowledgeStop(actor, roomId, peerId); break
            case 'stop': data = authority.stop(actor, roomId); break
            case 'report':
              data = authority.report(actor, roomId, body.reason)
              state.reports.push({ roomId, actorId: actor.id, reason: body.reason, at: t, until: t + 86_400_000 })
              break
            case 'poll': {
              const room = authority.state(actor, roomId)
              const peers = room.publisherId === actor.id && room.publisherPeer === peerId ? authority.viewerPeers(actor, roomId, peerId) : []
              const key = `${actor.id}:${peerId}`
              const messages = (state.mailboxes[key] || []).filter(message => message.roomId === roomId && message.epoch === room.epoch)
              delete state.mailboxes[key]
              data = { state: room, peers, messages }; break
            }
            case 'signal': {
              const message = body.message
              if (!message || !['offer', 'answer', 'reconnect'].includes(message.type) || typeof message.to !== 'string' || typeof message.targetId !== 'string') FAIL('invalid_signal', 400)
              if (message.type !== 'reconnect' && (!message.connectionId || !message.sdp || message.sdp.type !== message.type || typeof message.sdp.sdp !== 'string')) FAIL('invalid_signal', 400)
              authority.authorizeSignal(actor, roomId, peerId, message.to, message.epoch, message.type)
              const target = Object.values(state.sessions).find(candidate => candidate.actor.id === message.targetId && candidate.peerId === message.to)?.actor
              if (!target) FAIL('target_not_found', 404)
              const reverse = message.type === 'offer' ? 'answer' : 'offer'
              authority.authorizeSignal(target, roomId, message.to, peerId, message.epoch, reverse)
              const key = `${target.id}:${message.to}`, box = state.mailboxes[key] || []
              if (box.length >= 10) FAIL('mailbox_full', 429)
              box.push({ type: message.type, to: message.to, targetId: target.id, sdp: message.sdp, connectionId: message.connectionId,
                epoch: message.epoch, roomId, from: peerId, senderId: actor.id, until: t + 15_000 })
              state.mailboxes[key] = box; data = { accepted: true }; break
            }
            default: FAIL('unknown_action', 400)
          }
        }
      } catch (error) {
        if (!(error instanceof LivePolicyError)) throw error
        status = error.status; data = { error: error.code }
      }
      state.authority = authority.snapshot()
      if (action !== 'login') {
        const effectiveRoom = action === 'create' && status === 200 ? data.id : roomId
        const room = state.authority.rooms.find(([id]) => id === effectiveRoom)?.[1]
        state.ledger.push({ key: `${sessionKey}:${requestId}`, fingerprint, status, data, roomId: effectiveRoom, epoch: room?.epoch, until: t + 30_000 })
      }
      let serialized = JSON.stringify(state)
      // Keep retries/SDP bounded without dropping live authority or sessions.
      while (new TextEncoder().encode(serialized).length > MAX_STATE && state.ledger.length) {
        state.ledger.shift(); serialized = JSON.stringify(state)
      }
      if (new TextEncoder().encode(serialized).length > MAX_STATE) FAIL('lab_storage_limit', 429)
      const committed = await connection.prepare('UPDATE haku_live_lab_state SET body = ?1, version = version + 1 WHERE id = ?2 AND version = ?3 RETURNING version')
        .bind(serialized, KEY, row.version).first()
      if (committed) return response(status, data)
      await new Promise(resolve => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)))
    }
    FAIL('lab_store_busy', 503)
  } catch (error) { return failure(error) }
}
