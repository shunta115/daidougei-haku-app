import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import { makeAuthority, LivePolicyError } from './policy.mjs'

const fixtures = [
  { id: 'demo-performer', role: 'performer', approved: true, active: true, name: 'テストパフォーマー' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `demo-fan-${i + 1}`, role: 'fan', active: true, name: `観客 ${i + 1}` })),
]
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }

/** Loopback-only lab. Never deployed as a public authentication service. */
export function createLabServer({ root = fileURLToPath(new URL('../../dist', import.meta.url)), authority = makeAuthority() } = {}) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local fixture authentication cannot run in production')
  const sessions = new Map(), mailboxes = new Map(), rates = new Map()
  const parseActor = req => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
    const session = sessions.get(token)
    if (!session || session.until <= Date.now()) throw new LivePolicyError('authentication_required', 401)
    return session.actor
  }
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
    try {
      const address = req.socket.remoteAddress
      const host = req.headers.host || ''
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw new LivePolicyError('loopback_only')
      const origin = `http://${host}`
      if (req.headers.origin && req.headers.origin !== origin) throw new LivePolicyError('cross_origin_forbidden')
      const url = new URL(req.url, origin)
      if (!url.pathname.startsWith('/api/free-live')) {
        if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' })
        const file = resolve(root, '.' + (url.pathname === '/' ? '/haku-free-live.html' : decodeURIComponent(url.pathname)))
        if (!file.startsWith(resolve(root) + sep)) return send(res, 403, { error: 'invalid_path' })
        const data = await readFile(file).catch(() => null)
        if (!data) return send(res, 404, { error: 'not_found_build_first' })
        res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(data); return
      }
      if (req.method === 'GET' && ['/api/free-live', '/api/free-live/status'].includes(url.pathname)) return send(res, 200, {
        mode: 'local-fixtures', limits: authority.limits, fixtures: fixtures.map(({id, name}) => ({id, name})),
        network: 'p2p-no-turn', persistent: false,
      })
      if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) return send(res, 405, { error: 'json_post_required' })
      const key = String(req.headers.authorization || 'login')
      const window = rates.get(key) || { count: 0, until: Date.now() + 10_000 }
      if (Date.now() > window.until) { window.count = 0; window.until = Date.now() + 10_000 }
      if (++window.count > 100) throw new LivePolicyError('rate_limit', 429)
      rates.set(key, window)
      let size = 0, chunks = []
      for await (const chunk of req) { size += chunk.length; if (size > 40_000) throw new LivePolicyError('body_too_large', 413); chunks.push(chunk) }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const { action, roomId, peerId } = body
      if (action === 'login') {
        if (sessions.size >= 200) throw new LivePolicyError('session_capacity', 429)
        const actor = fixtures.find(u => u.id === body.fixtureId)
        if (!actor) throw new LivePolicyError('unknown_fixture')
        const token = randomBytes(32).toString('hex')
        sessions.set(token, { actor, until: Date.now() + 3_600_000 })
        return send(res, 200, { actor, token, fixture: true })
      }
      const actor = parseActor(req)
      if (peerId !== undefined && (typeof peerId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(peerId))) throw new LivePolicyError('invalid_peer', 400)
      let result
      switch (action) {
        case 'create': result = authority.create(actor); break
        case 'state': result = authority.state(actor, roomId); break
        case 'consent': result = authority.consent(actor, roomId, body.allowed); break
        case 'qr': result = authority.qr(actor, roomId); break
        case 'request': result = authority.request(actor, roomId, peerId, body.qrToken, body.consent); break
        case 'direct': result = authority.direct(actor, roomId, peerId); break
        case 'claim': result = authority.claim(actor, roomId, peerId, body.nonce, body.epoch); break
        case 'pending': result = authority.pendingGrant(actor, roomId, peerId); break
        case 'heartbeat': result = authority.heartbeat(actor, roomId, peerId, body.epoch); break
        case 'join': result = authority.join(actor, roomId, peerId); break
        case 'leave': result = authority.leave(actor, roomId, peerId); break
        case 'handoff': result = authority.handoff(actor, roomId, body.nextPeer); break
        case 'stopped': result = authority.acknowledgeStop(actor, roomId, peerId); break
        case 'stop': result = authority.stop(actor, roomId, 'manual_stop'); break
        case 'report': result = authority.report(actor, roomId, body.reason); break
        case 'poll': {
          const state = authority.state(actor, roomId)
          let peers = []
          if (state.publisherId === actor.id && state.publisherPeer === peerId) peers = authority.viewerPeers(actor, roomId, peerId)
          const mailboxKey = `${actor.id}:${peerId}`
          const messages = (mailboxes.get(mailboxKey) || []).filter(m => m.roomId === roomId && m.epoch === state.epoch && m.until > Date.now())
          mailboxes.delete(mailboxKey)
          result = { state, peers, messages }; break
        }
        case 'signal': {
          const m = body.message
          if (!m || !['offer', 'answer', 'candidate', 'reconnect'].includes(m.type) || typeof m.to !== 'string' || typeof m.targetId !== 'string') throw new LivePolicyError('invalid_signal', 400)
          authority.authorizeSignal(actor, roomId, peerId, m.to, m.epoch, m.type)
          // Resolve recipient identity through authoritative room membership; never trust targetId.
          const state = authority.state(actor, roomId)
          const targetActor = sessions.values().find(s => s.actor.id === m.targetId)?.actor
          if (!targetActor) throw new LivePolicyError('target_not_found', 404)
          // Validate the reverse direction as well to bind targetId to the target peer.
          const reverseType = m.type === 'offer' ? 'answer' : m.type === 'answer' ? 'offer' : 'candidate'
          authority.authorizeSignal(targetActor, roomId, m.to, peerId, state.epoch, reverseType)
          const boxKey = `${targetActor.id}:${m.to}`, box = mailboxes.get(boxKey) || []
          if (box.length >= 100) throw new LivePolicyError('mailbox_full', 429)
          box.push({ ...m, roomId, from: peerId, senderId: actor.id, until: Date.now() + 15_000 })
          mailboxes.set(boxKey, box); result = { accepted: true }; break
        }
        default: throw new LivePolicyError('unknown_action', 400)
      }
      send(res, 200, result)
    } catch (error) {
      send(res, error instanceof LivePolicyError ? error.status : 400, { error: error instanceof LivePolicyError ? error.code : 'invalid_request' })
    }
  })
  const interval = setInterval(() => {
    authority.tick()
    for (const [key, session] of sessions) if (session.until <= Date.now()) sessions.delete(key)
    for (const [key, box] of mailboxes) { const fresh = box.filter(m => m.until > Date.now()); if (fresh.length) mailboxes.set(key, fresh); else mailboxes.delete(key) }
    for (const [key, window] of rates) if (window.until <= Date.now()) rates.delete(key)
  }, 1000)
  interval.unref()
  server.on('close', () => clearInterval(interval))
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createLabServer()
  const port = Number(process.env.HAKU_LAB_PORT || 4319)
  server.listen(port, '127.0.0.1', () => process.stdout.write(`HAKU local lab: http://127.0.0.1:${port}/haku-free-live.html (fixture accounts only; not a public service)\n`))
}
