import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSrsCrowdGate } from './publish-gate.mjs';
import { makeCrowdHttpGateway } from './crowd-http.mjs';

const owner = { id: 'owner', role: 'performer', approved: true, active: true };
const fan = { id: 'camera', role: 'fan', approved: false, active: true };

test('HTTP QR → one-time WHIP → performer stop disconnects real media callback', async t => {
  const closed = [];
  const gate = makeSrsCrowdGate({
    openMedia: async () => ({ answer: 'v=0\r\n' }),
    closeMedia: async media => { closed.push(media); },
  });
  const { server } = makeCrowdHttpGateway({
    gate,
    resolveActor: req => req.headers.authorization === 'Bearer owner' ? owner :
      req.headers.authorization === 'Bearer camera' ? fan : null,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (path, as, value = {}, headers = {}) => {
    const response = await fetch(base + path, {
      method: 'POST', headers: { Authorization: 'Bearer ' + as, 'Content-Type': 'application/json', ...headers },
      body: headers['Content-Type'] === 'application/sdp' ? value : JSON.stringify(value),
    });
    return { status: response.status, value: await response.text() };
  };
  assert.equal((await call('/rooms', 'missing')).status, 401);
  const created = await call('/rooms', 'owner', {});
  assert.equal(created.status, 201);
  const room = JSON.parse(created.value);
  assert.equal((await call('/consent?room=' + room.id, 'camera', { allowed: true })).status, 403);
  await call('/consent?room=' + room.id, 'owner', { allowed: true });
  const qr = JSON.parse((await call('/qr?room=' + room.id, 'owner')).value);
  const grant = JSON.parse((await call('/request?room=' + room.id, 'camera', {
    peerId: 'peer1', token: qr.token, consent: true,
  })).value);
  const headers = {
    'Content-Type': 'application/sdp', 'x-haku-peer-id': 'peer1',
    'x-haku-grant-nonce': grant.nonce, 'x-haku-grant-epoch': String(grant.epoch),
  };
  assert.equal((await call('/whip?room=' + room.id, 'missing', 'v=0\r\n', headers)).status, 401);
  assert.equal((await call('/whip?room=' + room.id, 'owner', 'v=0\r\n', headers)).status, 403);
  assert.equal((await call('/whip?room=' + room.id, 'camera', 'v=0\r\n', headers)).status, 201);
  assert.equal((await call('/whip?room=' + room.id, 'camera', 'v=0\r\n', headers)).status, 403);
  assert.equal((await call('/stop?room=' + room.id, 'owner')).status, 200);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].actorId, fan.id);
  assert.equal((await call('/whip?room=' + room.id, 'camera', 'v=0\r\n', headers)).status, 403);
});
