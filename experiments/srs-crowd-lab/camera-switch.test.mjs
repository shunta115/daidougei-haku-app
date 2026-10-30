import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalWhipPublisher, localWhipEndpoint } from '../ovh-srs-lab/whip-publisher.mjs';

test('CROWD WHIP endpoint accepts room-bound HTTPS and localhost only', () => {
  const room = '00000000-0000-4000-8000-000000000001';
  assert.equal(localWhipEndpoint('https://test.example/whip?room=' + room).pathname, '/whip');
  assert.equal(localWhipEndpoint('http://127.0.0.1:4320/whip?room=' + room).pathname, '/whip');
  assert.throws(() => localWhipEndpoint('http://public.example/whip?room=' + room));
  assert.throws(() => localWhipEndpoint('https://test.example/whip?room=' + room + '&redirect=https://evil.example'));
});

test('camera replacement keeps audio track and existing stream', async () => {
  const oldVideo = { kind: 'video', stopped: false, stop() { this.stopped = true; } };
  const audio = { kind: 'audio', stopped: false, stop() { this.stopped = true; } };
  const newVideo = { kind: 'video', stopped: false, stop() { this.stopped = true; } };
  const tracks = [oldVideo, audio];
  const stream = {
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    getTracks: () => [...tracks],
    removeTrack: track => tracks.splice(tracks.indexOf(track), 1),
    addTrack: track => tracks.push(track),
  };
  const replaced = [];
  const publisher = new LocalWhipPublisher({
    getUserMedia: async () => ({ getVideoTracks: () => [newVideo], getTracks: () => [newVideo] }),
    PeerConnection: class {}, fetchImpl: async () => {}, onPreview: () => {},
  });
  publisher.state = 'live';
  publisher.stream = stream;
  publisher.pc = { getSenders: () => [{ track: oldVideo, replaceTrack: async track => replaced.push(track) }] };
  await publisher.switchCamera('user');
  assert.deepEqual(replaced, [newVideo]);
  assert.equal(oldVideo.stopped, true);
  assert.equal(newVideo.stopped, false);
  assert.equal(audio.stopped, false);
  assert.equal(tracks.includes(audio), true);
  assert.equal(tracks.includes(newVideo), true);
});
