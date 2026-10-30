// HAKU LIVE / SRS WHIP local proof-of-concept only.
// Never supply this client with production stream keys or production endpoints.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function localWhipEndpoint(value) {
  const url = new URL(value);
  const legacy = url.pathname === '/rtc/v1/whip/' && ['1985','4319'].includes(url.port) &&
      url.searchParams.get('app') === 'live' && /^haku-lab(?:-[a-z0-9]+)?$/.test(url.searchParams.get('stream') || '');
  const crowd = url.pathname === '/whip' && url.port === '4320' &&
      /^[a-f0-9-]{36}$/i.test(url.searchParams.get('room') || '') && url.searchParams.size === 1;
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || !(legacy || crowd)) {
    throw new Error('WHIP lab accepts only local SRS/gateway /rtc/v1/whip/?app=live&stream=haku-lab');
  }
  return url;
}

function waitForPeer(pc, property, event, success, ms, signal) {
  if (signal.aborted) return Promise.reject(new Error('LIVE start cancelled'));
  if (success.includes(pc[property])) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener(event, check);
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const check = () => {
      if (success.includes(pc[property])) finish();
      else if (['failed', 'closed'].includes(pc[property])) finish(new Error('WebRTC ' + property + ': ' + pc[property]));
    };
    const abort = () => finish(new Error('LIVE start cancelled'));
    const timer = setTimeout(() => finish(new Error('WebRTC ' + property + ' timeout')), ms);
    pc.addEventListener(event, check);
    signal.addEventListener('abort', abort, { once: true });
    check();
    if (signal.aborted) abort();
  });
}

function preferH264(pc, RTCImpl) {
  const codecs = globalThis.RTCRtpSender?.getCapabilities?.('video')?.codecs ?? RTCImpl?.getCapabilities?.('video')?.codecs;
  if (!codecs) return;
  const h264 = codecs.filter(codec => codec.mimeType?.toLowerCase() === 'video/h264');
  if (!h264.length) return;
  const rest = codecs.filter(codec => codec.mimeType?.toLowerCase() !== 'video/h264');
  for (const t of pc.getTransceivers?.() || []) {
    if (t.sender?.track?.kind === 'video' && typeof t.setCodecPreferences === 'function') {
      t.setCodecPreferences([...h264, ...rest]);
    }
  }
}

/** Target uplink budget, not a billing guarantee. Fail closed if unsupported. */
export async function capOutgoingMedia(pc) {
  const senders = pc.getSenders?.();
  if (!senders?.length) throw new Error('WebRTC sender unavailable; refusing uncapped LIVE');
  for (const sender of senders) {
    const kind = sender.track?.kind;
    if (kind !== 'video' && kind !== 'audio') continue;
    if (typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
      throw new Error('Cannot apply upload bitrate limits');
    }
    const parameters = sender.getParameters();
    if (!Array.isArray(parameters?.encodings) || !parameters.encodings.length) {
      throw new Error('No encoding available to apply upload bitrate limits');
    }
    for (const encoding of parameters.encodings) {
      encoding.maxBitrate = kind === 'video' ? 800_000 : 48_000;
      if (kind === 'video') encoding.maxFramerate = 24;
    }
    await sender.setParameters(parameters);
  }
}

export class LocalWhipPublisher {
  constructor({ getUserMedia, PeerConnection, fetchImpl, onState = () => {}, onPreview = () => {} }) {
    this.getUserMedia = getUserMedia;
    this.PeerConnection = PeerConnection;
    this.fetchImpl = fetchImpl;
    this.onState = onState;
    this.onPreview = onPreview;
    this.state = 'idle';
    this.generation = 0;
  }

  setState(state) { this.state = state; this.onState(state); }

  async start(endpointText, { headers = {}, mediaConstraints } = {}) {
    if (this.state !== 'idle' && this.state !== 'error') throw new Error('Already starting or live');
    const endpoint = localWhipEndpoint(endpointText);
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const assertActive = () => { if (generation !== this.generation || abort.signal.aborted) throw new Error('LIVE start cancelled'); };
    this.setState('starting');
    try {
      const stream = await this.getUserMedia(mediaConstraints ?? {
        video: { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'environment' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('LIVE start cancelled');
      }
      this.stream = stream;
      this.onPreview(stream);
      const pc = new this.PeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
      this.pc = pc;
      // Once a LIVE connection fails, release the physical camera/microphone.
      // A browser can otherwise keep capturing after the network is gone.
      pc.addEventListener('connectionstatechange', () => {
        if (this.pc !== pc || generation !== this.generation) return;
        if (pc.connectionState === 'failed') {
          this.stop();
          this.setState('error');
        }
      });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      preferH264(pc, this.PeerConnection);
      const offer = await pc.createOffer();
      assertActive();
      await pc.setLocalDescription(offer);
      assertActive();
      await capOutgoingMedia(pc);
      assertActive();
      await waitForPeer(pc, 'iceGatheringState', 'icegatheringstatechange', ['complete'], 10000, abort.signal);
      assertActive();
      this.setState('connecting');
      const response = await this.fetchImpl(endpoint.href, {
        method: 'POST', headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp', ...headers },
        body: pc.localDescription.sdp, signal: abort.signal, redirect: 'error'
      });
      if (!response.ok) throw new Error('WHIP server rejected publish: HTTP ' + response.status);
      const answer = await response.text();
      assertActive();
      if (!answer.startsWith('v=0')) throw new Error('WHIP server returned invalid SDP');
      const location = response.headers?.get?.('location');
      if (location) {
        const candidate = new URL(location, endpoint);
        if (candidate.origin === endpoint.origin && candidate.pathname.startsWith('/rtc/')) this.resourceUrl = candidate.href;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      assertActive();
      await waitForPeer(pc, 'connectionState', 'connectionstatechange', ['connected'], 15000, abort.signal);
      assertActive();
      this.setState('live');
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.stop();
        this.setState('error');
      }
      throw error;
    }
  }

  async switchCamera(facingMode) {
    if (this.state !== 'live' || !this.pc || !this.stream || this.switchingCamera) throw new Error('Camera switch unavailable');
    if (!['user', 'environment'].includes(facingMode)) throw new Error('Invalid camera');
    const sender = this.pc.getSenders().find(item => item.track?.kind === 'video');
    if (!sender) throw new Error('Video sender unavailable');
    this.switchingCamera = true;
    let replacement;
    try {
      replacement = await this.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false });
      const next = replacement.getVideoTracks()[0];
      if (!next || this.state !== 'live') throw new Error('Camera switch cancelled');
      await sender.replaceTrack(next);
      if (this.state !== 'live') throw new Error('Camera switch cancelled');
      const previous = this.stream.getVideoTracks()[0];
      if (previous) { this.stream.removeTrack(previous); previous.stop(); }
      this.stream.addTrack(next);
      this.onPreview(this.stream);
      this.facingMode = facingMode;
      replacement = null;
    } finally {
      replacement?.getTracks().forEach(track => track.stop());
      this.switchingCamera = false;
    }
  }

  stop() {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
    this.pc?.close();
    this.pc = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.onPreview(null);
    const resourceUrl = this.resourceUrl;
    this.resourceUrl = null;
    if (resourceUrl) {
      // RFC WHIP cleanup where supported. Closing the peer connection is always required.
      void this.fetchImpl(resourceUrl, { method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(1500) }).catch(() => {});
    }
    this.setState('idle');
  }
}
