import test from 'node:test';
import assert from 'node:assert/strict';
import { localWhipEndpoint, LocalWhipPublisher } from './whip-publisher.mjs';

const ENDPOINT = 'http://127.0.0.1:1985/rtc/v1/whip/?app=live&stream=haku-lab';
const fakeTrack = () => ({ kind: 'video', stopped: false, stop() { this.stopped = true; } });
const fakeStream = () => { const track = fakeTrack(); return { track, getTracks: () => [track] }; };
class FakePC {
  static getCapabilities() { return { codecs: [{ mimeType: 'video/H264' }, { mimeType: 'video/VP8' }] }; }
  constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'connected'; this.listeners = new Map(); this.transceivers = []; this.closed = false; }
  addTrack(track) { const t = { sender: { track }, setCodecPreferences(c) { this.codecs = c; } }; this.transceivers.push(t); }
  getTransceivers() { return this.transceivers; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=local' }; }
  async setLocalDescription(desc) { this.localDescription = desc; }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  addEventListener(event, handler) { this.listeners.set(event, handler); }
  removeEventListener(event) { this.listeners.delete(event); }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
const response = { ok: true, status: 201, headers: { get: name => name === 'location' ? '/rtc/v1/whip/resource/123' : null }, text: async () => 'v=0\r\no=server' };

test('WHIP endpoint is locked to local SRS lab', () => {
  assert.equal(localWhipEndpoint(ENDPOINT).hostname, '127.0.0.1');
  for (const url of [
    'https://example.com/rtc/v1/whip/?app=live&stream=haku-lab',
    'http://127.0.0.1:1985/rtc/v1/whip/?app=live&stream=production',
    'http://127.0.0.1:1985/rtc/v1/whip/?app=other&stream=haku-lab',
    'http://169.254.169.254/rtc/v1/whip/?app=live&stream=haku-lab'
  ]) assert.throws(() => localWhipEndpoint(url));
});

test('one click starts, sends SDP, and stop releases camera and WHIP resource', async () => {
  const stream = fakeStream();
  const requests = [];
  const states = [];
  const publisher = new LocalWhipPublisher({
    getUserMedia: async () => stream,
    PeerConnection: FakePC,
    fetchImpl: async (url, init) => { requests.push({ url, init }); return response; },
    onState: state => states.push(state)
  });
  assert.equal(await publisher.start(ENDPOINT), true);
  assert.equal(publisher.state, 'live');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.body, 'v=0\r\no=local');
  assert.equal(publisher.pc.remoteDescription.type, 'answer');
  assert.equal(publisher.pc.transceivers[0].codecs[0].mimeType, 'video/H264');
  publisher.stop();
  assert.equal(stream.track.stopped, true);
  assert.equal(requests[1].init.method, 'DELETE');
  assert.equal(publisher.state, 'idle');
  assert.deepEqual(states, ['starting', 'connecting', 'live', 'idle']);
});

test('server error stops tracks without leaking camera', async () => {
  const stream = fakeStream();
  const publisher = new LocalWhipPublisher({
    getUserMedia: async () => stream,
    PeerConnection: FakePC,
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  await assert.rejects(publisher.start(ENDPOINT), /403/);
  assert.equal(stream.track.stopped, true);
  assert.equal(publisher.state, 'error');
});

test('stop during pending camera permission cannot resurrect a stream', async () => {
  let resolveCamera;
  const stream = fakeStream();
  const publisher = new LocalWhipPublisher({
    getUserMedia: () => new Promise(resolve => { resolveCamera = resolve; }),
    PeerConnection: FakePC,
    fetchImpl: async () => response
  });
  const start = publisher.start(ENDPOINT);
  publisher.stop();
  resolveCamera(stream);
  await assert.rejects(start, /cancelled/);
  assert.equal(stream.track.stopped, true);
  assert.equal(publisher.state, 'idle');
});

test('stop while SDP negotiation is pending cannot reenter connecting state', async () => {
  let release;
  class SlowPC extends FakePC {
    async setLocalDescription(desc) {
      await new Promise(resolve => { release = resolve; });
      await super.setLocalDescription(desc);
    }
  }
  const stream = fakeStream();
  const states = [];
  let fetches = 0;
  const publisher = new LocalWhipPublisher({
    getUserMedia: async () => stream,
    PeerConnection: SlowPC,
    fetchImpl: async () => { fetches++; return response; },
    onState: s => states.push(s)
  });
  const pending = publisher.start(ENDPOINT);
  for (let i=0; !release && i<20; i++) await new Promise(resolve => setTimeout(resolve,0));
  assert.equal(typeof release, 'function');
  publisher.stop();
  release();
  await assert.rejects(pending, /cancelled/);
  assert.equal(fetches,0);
  assert.equal(stream.track.stopped,true);
  assert.deepEqual(states,['starting','idle']);
});

test('unexpected WebRTC failure after LIVE stops physical camera and microphone', async () => {
  const stream = fakeStream();
  const publisher = new LocalWhipPublisher({
    getUserMedia: async () => stream,
    PeerConnection: FakePC,
    fetchImpl: async () => response
  });
  await publisher.start(ENDPOINT);
  const pc = publisher.pc;
  pc.connectionState = 'failed';
  pc.listeners.get('connectionstatechange')?.();
  assert.equal(stream.track.stopped, true);
  assert.equal(pc.closed, true);
  assert.equal(publisher.state, 'error');
});
