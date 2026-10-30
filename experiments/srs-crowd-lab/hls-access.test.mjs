import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWatchTickets, rewriteHlsPlaylist } from './hls-access.mjs';

const roomId = '10000000-0000-4000-8000-000000000001';
const ownerId = '20000000-0000-4000-8000-000000000001';
const otherRoom = '10000000-0000-4000-8000-000000000002';
const state = { phase: 'live', epoch: 3, performerId: ownerId, publisherId: '30000000-0000-4000-8000-000000000001' };

test('HLS ticket is bound to actor, room, epoch and expiry', () => {
  let time = 1000;
  const tickets = makeWatchTickets({ secret: Buffer.alloc(32, 7), now: () => time, lifetimeMs: 5000 });
  const token = tickets.issue({ roomId, actorId: ownerId, epoch: 3 });
  assert.equal(tickets.verify(token, roomId, state), true);
  assert.equal(tickets.verify(token, otherRoom, state), false);
  assert.equal(tickets.verify(token.slice(0, -1) + 'x', roomId, state), false);
  assert.equal(tickets.verify(token, roomId, { ...state, epoch: 4 }), false);
  assert.equal(tickets.verify(token, roomId, { ...state, phase: 'ended' }), false);
  time = 6000;
  assert.equal(tickets.verify(token, roomId, state), false);
});

test('HLS playlist retains SRS context and adds a viewing ticket to each segment', () => {
  const url = new URL('http://127.0.0.1:4320/live/haku-lab-10000000000040008000000000000001.m3u8?watch=t');
  const output = rewriteHlsPlaylist('#EXTM3U\nhaku-lab-10000000000040008000000000000001-0.ts?hls_ctx=abc123\n', url, 't');
  assert.match(output, /hls_ctx=abc123&watch=t/);
  assert.throws(() => rewriteHlsPlaylist('https://untrusted.example/video.ts', url, 't'), /invalid_hls_path/);
});
