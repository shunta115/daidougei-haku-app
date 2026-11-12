import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handleSitesLiveRequest } from '../../experiments/free-live/sites-controller.mjs';

// Run with a standalone Sites/Vinext checkout as argv[2]; its Wrangler supplies Miniflare.
const require = createRequire(resolve(process.argv[2] || process.cwd(), 'package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, Log, LogLevel } = wranglerRequire('miniflare');
const runtime = new Miniflare({
  modules: true, compatibilityDate: '2026-05-15',
  script: 'export default { fetch() { return new Response("test-only") } }',
  d1Databases: { DB: 'haku-disposable-test' },
  log: new Log(LogLevel.ERROR),
});
try {
  const db = await runtime.getD1Database('DB');
  const sql = await readFile(new URL('../../experiments/free-live/sites-schema.sql', import.meta.url), 'utf8');
  await db.exec(sql.replace(/^--.*$/gm, '').replaceAll('\n', ' '));
  let clock = Date.parse('2026-10-28T03:00:00Z');
  const call = async (body, session = {}, headers = {}) => {
    const response = await handleSitesLiveRequest(new Request('https://lab.test/api/free-live', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://lab.test',
        'oai-authenticated-user-id': 'test-owner', authorization: `Bearer ${session.token || ''}`, ...headers },
      body: JSON.stringify({ peerId: session.peerId || crypto.randomUUID(), requestId: crypto.randomUUID(), ...body }),
    }), { db, now: () => clock });
    return { status: response.status, data: await response.json() };
  };
  const login = async fixtureId => {
    const peerId = crypto.randomUUID(), result = await call({ action: 'login', fixtureId, peerId });
    assert.equal(result.status, 200); return { ...result.data, peerId };
  };
  const owner = await login('demo-performer');
  const roomId = (await call({ action: 'create' }, owner)).data.id;
  const grant = (await call({ action: 'direct', roomId }, owner)).data;
  assert.equal((await call({ action: 'claim', roomId, ...grant }, owner)).status, 200);
  const fans = await Promise.all(Array.from({ length: 6 }, () => login('demo-fan-1')));
  const seats = await Promise.all(fans.map(fan => call({ action: 'join', roomId }, fan)));
  assert.equal(seats.filter(result => result.status === 200).length, 5);
  assert.equal(seats.filter(result => result.data.error === 'viewer_limit').length, 1);
  assert.equal((await call({ action: 'create' }, fans[0])).status, 403);
  assert.equal((await call({ action: 'stop', roomId }, owner, { origin: 'https://other.test' })).status, 403);
  await call({ action: 'consent', roomId, allowed: true }, owner);
  const qr = (await call({ action: 'qr', roomId }, owner)).data;
  const camera = fans[seats.findIndex(result => result.status === 429)];
  assert.equal((await call({ action: 'request', roomId, qrToken: qr.token, consent: true }, camera)).data.queued, true);
  await call({ action: 'handoff', roomId, nextPeer: camera.peerId }, owner);
  assert.equal((await call({ action: 'pending', roomId }, camera)).data, null);
  await call({ action: 'stopped', roomId }, owner);
  const nextGrant = (await call({ action: 'pending', roomId }, camera)).data;
  assert.equal((await call({ action: 'claim', roomId, ...nextGrant }, camera)).status, 200);
  await call({ action: 'stop', roomId }, owner);
  assert.equal((await call({ action: 'claim', roomId, ...nextGrant }, camera)).status, 410);
  const row = await db.prepare('SELECT body FROM haku_live_lab_state').first();
  const state = JSON.parse(row.body);
  assert.equal(state.authority.rooms[0][1].phase, 'ended');
  assert.equal(state.authority.rooms[0][1].viewers.length, 0);
  assert.ok(state.requests.used < 100);
  process.stdout.write(JSON.stringify({ engine: 'Miniflare D1 / SQLite', passed: true, concurrentSeats: 5,
    sixthRejected: true, cameraHandoff: true, endedGrantRejected: true, requests: state.requests.used }) + '\n');
} finally { await runtime.dispose(); }
