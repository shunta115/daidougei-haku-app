import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { handleSitesLiveRequest } from '../experiments/free-live/sites-controller.mjs'

const opened: DatabaseSync[] = []
function storage() {
  const sqlite = new DatabaseSync(':memory:'); opened.push(sqlite)
  sqlite.exec('CREATE TABLE haku_live_lab_state (id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)')
  const db = {
    withSession: (_constraint: string) => db,
    prepare(sql: string) {
      const statement = sqlite.prepare(sql)
      return { bind(...values: (string | number)[]) {
        return {
          async first() { await Promise.resolve(); return statement.get(...values) || null },
          async run() { await Promise.resolve(); statement.run(...values); return { success: true } },
        }
      } }
    },
  }
  return { db, sqlite }
}
function lab() {
  const { db, sqlite } = storage()
  let clock = Date.parse('2026-10-28T03:00:00Z')
  async function call(body: Record<string, unknown>, session?: { token: string; peerId: string }, headers: Record<string, string> = {}) {
    const request = new Request('https://lab.test/api/free-live', { method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://lab.test', 'oai-authenticated-user-id': 'owner-one',
        ...(session ? { authorization: `Bearer ${session.token}` } : {}), ...headers },
      body: JSON.stringify({ peerId: session?.peerId || crypto.randomUUID(), requestId: crypto.randomUUID(), ...body }),
    })
    const result = await handleSitesLiveRequest(request, { db, now: () => clock })
    return { status: result.status, data: await result.json() }
  }
  async function login(fixtureId = 'demo-performer') {
    const peerId = crypto.randomUUID()
    const result = await call({ action: 'login', fixtureId, peerId })
    expect(result.status).toBe(200)
    return { ...result.data, peerId }
  }
  async function direct() {
    const owner = await login()
    const created = await call({ action: 'create' }, owner)
    const roomId = created.data.id
    const grant = await call({ action: 'direct', roomId }, owner)
    const started = await call({ action: 'claim', roomId, nonce: grant.data.nonce, epoch: grant.data.epoch }, owner)
    expect(started.status).toBe(200)
    return { owner, roomId, epoch: started.data.epoch }
  }
  const read = () => JSON.parse((sqlite.prepare('SELECT body FROM haku_live_lab_state').get() as { body: string }).body)
  const write = (state: unknown) => sqlite.prepare('UPDATE haku_live_lab_state SET body = ?').run(JSON.stringify(state))
  return { db, call, login, direct, read, write, advance: (ms: number) => { clock += ms } }
}
afterEach(() => { for (const sqlite of opened.splice(0)) sqlite.close() })

describe('owner-private Sites signaling with real SQLite compare-and-swap', () => {
  it('does not turn private service access or role claims into visitor authentication', async () => {
    const app = lab()
    const anonymous = await handleSitesLiveRequest(new Request('https://lab.test/api/free-live'), { db: app.db })
    expect(anonymous.status).toBe(401)
    const health = await handleSitesLiveRequest(new Request('https://lab.test/api/free-live?health=1'), { db: app.db })
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ persistent: true, mediaRelay: false, requiresVisitorIdentity: true })
    const fan = await app.login('demo-fan-1')
    expect((await app.call({ action: 'create', role: 'performer', approved: true }, fan)).status).toBe(403)
  })

  it('keeps five seats under six simultaneous joins across independent requests', async () => {
    const app = lab(), { roomId } = await app.direct()
    const fans = await Promise.all(Array.from({ length: 6 }, () => app.login('demo-fan-1')))
    const results = await Promise.all(fans.map(fan => app.call({ action: 'join', roomId }, fan)))
    expect(results.filter(result => result.status === 200)).toHaveLength(5)
    expect(results.filter(result => result.data.error === 'viewer_limit')).toHaveLength(1)
    expect(app.read().authority.rooms[0][1].viewers).toHaveLength(5)
  })

  it('binds every role session to its authenticated owner and original peer', async () => {
    const app = lab(), owner = await app.login()
    expect((await app.call({ action: 'create', peerId: crypto.randomUUID() }, owner)).status).toBe(401)
    expect((await app.call({ action: 'create' }, owner, { 'oai-authenticated-user-id': 'another-account' })).status).toBe(403)
    expect((await app.call({ action: 'create' }, owner, { origin: 'https://other.test' })).status).toBe(403)
    expect((await app.call({ action: 'create' }, owner, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await app.call({ action: 'create' }, undefined)).status).toBe(401)
  })

  it('delivers SDP only to the actor and peer admitted by authoritative membership', async () => {
    const app = lab(), { owner, roomId, epoch } = await app.direct()
    const viewer = await app.login('demo-fan-1'), outsider = await app.login('demo-fan-1')
    await app.call({ action: 'join', roomId }, viewer)
    const signal = { type: 'offer', epoch, to: viewer.peerId, targetId: viewer.actor.id,
      connectionId: crypto.randomUUID(), sdp: { type: 'offer', sdp: 'v=0\r\n' } }
    expect((await app.call({ action: 'signal', roomId, message: { ...signal, targetId: outsider.actor.id } }, owner)).status).toBe(404)
    expect((await app.call({ action: 'signal', roomId, message: signal }, outsider)).status).toBe(403)
    expect((await app.call({ action: 'signal', roomId, message: signal }, owner)).status).toBe(200)
    const received = await app.call({ action: 'poll', roomId }, viewer)
    expect(received.data.messages).toHaveLength(1)
    expect(received.data.messages[0]).toMatchObject({ from: owner.peerId, senderId: owner.actor.id, epoch })
    expect((await app.call({ action: 'poll', roomId }, outsider)).data.messages).toHaveLength(0)
  })

  it('waits for old-camera acknowledgement, then revokes old grants and signals', async () => {
    const app = lab(), { owner, roomId, epoch } = await app.direct()
    const fan = await app.login('demo-fan-1')
    expect((await app.call({ action: 'qr', roomId }, owner)).status).toBe(403)
    await app.call({ action: 'consent', roomId, allowed: true }, owner)
    const qr = await app.call({ action: 'qr', roomId }, owner)
    expect((await app.call({ action: 'request', roomId, qrToken: qr.data.token, consent: true }, fan)).data.queued).toBe(true)
    const switching = await app.call({ action: 'handoff', roomId, nextPeer: fan.peerId }, owner)
    expect(switching.data.phase).toBe('switching')
    expect((await app.call({ action: 'pending', roomId }, fan)).data).toBeNull()
    expect((await app.call({ action: 'stopped', roomId }, fan)).status).toBe(403)
    expect((await app.call({ action: 'heartbeat', roomId, epoch }, owner)).status).toBe(403)
    await app.call({ action: 'stopped', roomId }, owner)
    const grant = (await app.call({ action: 'pending', roomId }, fan)).data
    const claim = { action: 'claim', roomId, nonce: grant.nonce, epoch: grant.epoch, requestId: crypto.randomUUID() }
    const started = await app.call(claim, fan)
    expect(started.status).toBe(200)
    expect((await app.call({ ...claim, requestId: crypto.randomUUID() }, fan)).status).toBe(403)
    await app.call({ action: 'stop', roomId }, owner)
    expect((await app.call(claim, fan)).data.error).toBe('stale_request')
    expect((await app.call({ action: 'claim', roomId, nonce: grant.nonce, epoch: grant.epoch }, fan)).status).toBe(410)
  })

  it('does not double-spend a single-use request after a response retry', async () => {
    const app = lab(), owner = await app.login()
    const request = { action: 'create', requestId: crypto.randomUUID() }
    const first = await app.call(request, owner), before = app.read().requests.used
    const replay = await app.call(request, owner)
    expect(replay).toEqual(first)
    expect(app.read().requests.used).toBe(before)
    expect((await app.call({ ...request, action: 'direct', roomId: first.data.id }, owner)).data.error).toBe('request_id_reused')
  })

  it('removes the next camera operator from viewer slots when switching from viewing to filming', async () => {
    const app = lab(), { owner, roomId } = await app.direct(), fan = await app.login('demo-fan-1')
    await app.call({ action: 'join', roomId }, fan)
    await app.call({ action: 'consent', roomId, allowed: true }, owner)
    const qr = (await app.call({ action: 'qr', roomId }, owner)).data
    await app.call({ action: 'request', roomId, qrToken: qr.token, consent: true }, fan)
    await app.call({ action: 'handoff', roomId, nextPeer: fan.peerId }, owner)
    await app.call({ action: 'stopped', roomId }, owner)
    const grant = (await app.call({ action: 'pending', roomId }, fan)).data
    const live = await app.call({ action: 'claim', roomId, nonce: grant.nonce, epoch: grant.epoch }, fan)
    expect(live.data.viewers).toBe(0)
    expect((await app.call({ action: 'poll', roomId }, fan)).data.peers).toHaveLength(0)
  })

  it('retains lease expiry and reports after rebuilding authority from persisted state', async () => {
    const app = lab(), { owner, roomId } = await app.direct()
    app.advance(12_001)
    const ended = await app.call({ action: 'state', roomId }, owner)
    expect(ended.data).toMatchObject({ phase: 'ended', reason: 'publisher_disconnected' })
    const fan = await app.login('demo-fan-1')
    expect((await app.call({ action: 'report', roomId, reason: 'privacy' }, fan)).data.quarantined).toBe(true)
    expect(app.read().reports[0].reason).toBe('privacy')
  })

  it('hard stops requests and rejects new sessions after the daily application cap', async () => {
    const app = lab(), owner = await app.login(), stored = app.read()
    stored.requests.used = 10_000; app.write(stored)
    expect((await app.call({ action: 'create' }, owner)).data.error).toBe('lab_daily_request_limit')
    expect((await app.call({ action: 'login', fixtureId: 'demo-fan-1' })).status).toBe(429)
    expect(app.read().requests.used).toBe(10_000)
  })
})
