import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox',
] });
const page = await browser.newPage({ permissions: ['camera', 'microphone'] });
try {
  await page.goto('http://127.0.0.1:4320/', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { LocalWhipPublisher } = await import('/whip-publisher.mjs');
    const api = async (path, actor, payload) => {
      const response = await fetch(path, {
        method: 'POST', headers: { Authorization: 'Bearer ' + actor, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'api_failed');
      return data;
    };
    const room = await api('/rooms', 'owner');
    await api('/consent?room=' + room.id, 'owner', { allowed: true });
    const qr = await api('/qr?room=' + room.id, 'owner');
    const peerId = 'camera-peer-1';
    const grant = await api('/request?room=' + room.id, 'camera', { peerId, token: qr.token, consent: true });
    const publisher = new LocalWhipPublisher({
      getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
      PeerConnection: RTCPeerConnection,
      fetchImpl: (...args) => fetch(...args),
    });
    window.__crowdPublisher = publisher;
    window.__crowdRoom = room.id;
    await publisher.start(location.origin + '/whip?room=' + room.id, {
      headers: {
        Authorization: 'Bearer camera',
        'x-haku-peer-id': peerId,
        'x-haku-grant-nonce': grant.nonce,
        'x-haku-grant-epoch': String(grant.epoch),
      },
      mediaConstraints: { video: { facingMode: { ideal: 'environment' } }, audio: true },
    });
    const tracks = publisher.stream.getTracks();
    if (publisher.state !== 'live' || tracks.filter(t => t.kind === 'video').length !== 1 ||
        tracks.filter(t => t.kind === 'audio').length !== 1) throw new Error('media_not_live');
    return { roomId: room.id, video: tracks.find(t => t.kind === 'video').getSettings() };
  });
  const stream = 'haku-lab-' + result.roomId.replaceAll('-', '');
  await writeFile('/tmp/haku-crowd-stream', stream, { mode: 0o600 });
  console.log(JSON.stringify({ browserWhipConnected: true, capturedWidth: result.video.width, capturedHeight: result.video.height }));
  await new Promise(resolve => setTimeout(resolve, 80000));
  const stopped = await page.evaluate(async () => {
    const response = await fetch('/stop?room=' + window.__crowdRoom, {
      method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}',
    });
    const result = await response.json();
    window.__crowdPublisher.stop();
    return response.ok && result.phase === 'ended';
  });
  if (!stopped) throw new Error('performer_stop_failed');
  console.log('Performer stop ended the CROWD session');
} finally {
  await browser.close();
}
