import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSrsCrowdGate } from './publish-gate.mjs';

const performer = { id: 'performer-1', role: 'performer', active: true, approved: true };
const fan = { id: 'fan-1', role: 'fan', active: true, approved: false };
const nextFan = { id: 'fan-2', role: 'fan', active: true, approved: false };

function fixture() {
  let time = Date.parse('2026-10-30T00:00:00+09:00');
  let serial = 0;
  const opened = [], closed = [];
  const gate = makeSrsCrowdGate({
    now: () => time,
    id: () => 'id-' + ++serial,
    openMedia: async media => { opened.push(media); return { answer: 'v=0', cid: String(serial) }; },
    closeMedia: async media => { closed.push(media); },
  });
  return { gate, opened, closed, advance: ms => { time += ms; } };
}

test('preapproved QR grants one camera, bound to the actual fan identity and performer room', async () => {
  const { gate, opened } = fixture();
  const room = gate.create(performer);
  gate.consent(performer, room.id, true);
  const qr = gate.qr(performer, room.id);
  const grant = gate.request(fan, room.id, 'peer-1', qr.token, true);
  assert.equal(grant.actorId, fan.id);
  const result = await gate.publish(fan, room.id, 'peer-1', grant.nonce, grant.epoch, 'v=0');
  assert.equal(result.room.performerId, performer.id);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].actorId, fan.id);
  assert.equal(opened[0].roomId, room.id);
  assert.throws(() => gate.request(fan, room.id, 'peer-2', qr.token, true));
  await assert.rejects(gate.publish(fan, room.id, 'peer-1', grant.nonce, grant.epoch, 'v=0'));
  await assert.rejects(gate.publish(nextFan, room.id, 'peer-1', grant.nonce, grant.epoch, 'v=0'));
  assert.equal(opened.length, 1);
});

test('performer revocation calls SRS disconnect and blocks stale publish', async () => {
  const { gate, closed } = fixture();
  const room = gate.create(performer);
  gate.consent(performer, room.id, true);
  const qr = gate.qr(performer, room.id);
  const grant = gate.request(fan, room.id, 'peer-1', qr.token, true);
  await gate.publish(fan, room.id, 'peer-1', grant.nonce, grant.epoch, 'v=0');
  await gate.stop(performer, room.id);
  assert.equal(closed.length, 1);
  assert.equal(gate.state(performer, room.id).phase, 'ended');
  await assert.rejects(gate.publish(fan, room.id, 'peer-1', grant.nonce, grant.epoch, 'v=0'));
});

test('handoff disconnects old camera before granting the new one', async () => {
  const { gate, closed, opened } = fixture();
  const room = gate.create(performer);
  gate.consent(performer, room.id, true);
  const qr = gate.qr(performer, room.id);
  const first = gate.request(fan, room.id, 'peer-1', qr.token, true);
  await gate.publish(fan, room.id, 'peer-1', first.nonce, first.epoch, 'v=0');
  gate.request(nextFan, room.id, 'peer-2', qr.token, true);
  await gate.handoff(performer, room.id, 'peer-2');
  assert.equal(closed.length, 1);
  assert.equal(opened.length, 1);
  const next = gate.acknowledgeStop(fan, room.id, 'peer-1');
  assert.equal(next.phase, 'arming');
  const grant = gate.authority.pendingGrant(nextFan, room.id, 'peer-2');
  await gate.publish(nextFan, room.id, 'peer-2', grant.nonce, grant.epoch, 'v=0');
  assert.equal(opened.length, 2);
});

test('three one-hour starts per Tokyo calendar day', async () => {
  const { gate, advance } = fixture();
  for (let i = 0; i < 3; i++) {
    const room = gate.create(performer);
    await gate.stop(performer, room.id);
  }
  assert.throws(() => gate.create(performer), /daily_live_limit/);
  advance(24 * 60 * 60_000);
  assert.equal(gate.create(performer).performerId, performer.id);
});

test('expired QR and failed SRS publish fail closed', async () => {
  const { gate, advance, opened } = fixture();
  const room = gate.create(performer);
  gate.consent(performer, room.id, true);
  const qr = gate.qr(performer, room.id);
  advance(5 * 60_000 + 1);
  assert.throws(() => gate.request(fan, room.id, 'peer-1', qr.token, true), /invalid_or_expired_qr/);
  const direct = gate.direct(performer, room.id, 'owner-peer');
  await gate.publish(performer, room.id, 'owner-peer', direct.nonce, direct.epoch, 'v=0');
  assert.equal(opened.length, 1);
});
