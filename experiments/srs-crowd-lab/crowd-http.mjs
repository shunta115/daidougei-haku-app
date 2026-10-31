// Non-production loopback proof. Caller must supply a real authenticated actor resolver.
// Never bind this gateway or the unauthenticated SRS API to a public interface.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { makeSrsCrowdGate } from './publish-gate.mjs';
import { openSrsWhip, closeSrsWhip } from './srs-loopback.mjs';
import { makeWatchTickets, rewriteHlsPlaylist } from './hls-access.mjs';

const MAX_BODY = 128 * 1024;
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};
async function body(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw Object.assign(new Error('request_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function makeCrowdHttpGateway({ resolveActor, gate = makeSrsCrowdGate({ openMedia: openSrsWhip, closeMedia: closeSrsWhip }) } = {}) {
  if (typeof resolveActor !== 'function') throw new Error('authenticated_actor_resolver_required');
  const tickets = makeWatchTickets({ secret: gate.watchSecret() });
  let timer;
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const origin = 'http://127.0.0.1:' + address.port;
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
        json(res, 403, { error: 'local_origin_only' }); return;
      }
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('<!doctype html><meta charset="utf-8"><title>HAKU CROWD local proof</title>'); return;
      }
      if (req.method === 'GET' && req.url === '/whip-publisher.mjs') {
        const source = await readFile(new URL('../ovh-srs-lab/whip-publisher.mjs', import.meta.url));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(source); return;
      }
      const mediaUrl = new URL(req.url, origin);
      const hlsPath = /^\/live\/haku-lab-[a-f0-9]{32}(?:-[0-9]+)?\.(?:m3u8|ts)$/.test(mediaUrl.pathname);
      if (req.method === 'GET' && hlsPath) {
        const token = mediaUrl.searchParams.get('watch');
        const roomId = gate.roomIds().find(key => mediaUrl.pathname.startsWith('/live/haku-lab-' + key.replaceAll('-', '')));
        const sourceActor = gate.ownerForRoom(roomId);
        let state;
        try { state = sourceActor ? gate.state(sourceActor, roomId) : null; } catch { state = null; }
        const otherParams = [...mediaUrl.searchParams.keys()].filter(key => key !== 'watch');
        if (!roomId || otherParams.some(key => key !== 'hls_ctx') || otherParams.length > 1 ||
            (otherParams.length && !/^[a-z0-9]{1,64}$/.test(mediaUrl.searchParams.get('hls_ctx') || '')) ||
            !tickets.verify(token, roomId, state, (...claims) => gate.canWatchClaim(...claims))) {
          json(res, 401, { error: 'watch_not_authorized' }); return;
        }
        const upstream = new URL('http://127.0.0.1:8080' + mediaUrl.pathname);
        if (mediaUrl.searchParams.has('hls_ctx')) upstream.searchParams.set('hls_ctx', mediaUrl.searchParams.get('hls_ctx'));
        const response = await fetch(upstream, { redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (!response.ok) { json(res, response.status, { error: 'hls_unavailable' }); return; }
        const playlist = mediaUrl.pathname.endsWith('.m3u8');
        res.writeHead(200, {
          'Content-Type': playlist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
          'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        });
        if (playlist) res.end(rewriteHlsPlaylist(await response.text(), mediaUrl, token));
        else res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const actor = await resolveActor(req);
      if (!actor?.id || actor.active !== true) { json(res, 401, { error: 'authentication_required' }); return; }
      const url = new URL(req.url, origin);
      const roomId = url.searchParams.get('room');
      if (req.method === 'POST' && url.pathname === '/rooms') {
        const data = JSON.parse(await body(req) || '{}');
        const room = gate.create(actor, data.title);
        json(res, 201, room); return;
      }
      if (!roomId || url.searchParams.size !== 1) { json(res, 404, { error: 'not_found' }); return; }
      if (req.method === 'GET' && url.pathname === '/state') { json(res, 200, gate.state(actor, roomId)); return; }
      if (req.method === 'GET' && url.pathname === '/watch-ticket') {
        const state = gate.authorizeWatch(actor, roomId);
        json(res, 200, { ticket: tickets.issue({ roomId, actorId: actor.id, epoch: state.epoch, audienceGeneration: state.audienceGeneration ?? null }), refreshAfterMs: 60_000 }); return;
      }
      if (req.method !== 'POST') { json(res, 404, { error: 'not_found' }); return; }
      if (url.pathname === '/whip') {
        if (!String(req.headers['content-type'] || '').startsWith('application/sdp')) { json(res, 415, { error: 'sdp_required' }); return; }
        const peerId = String(req.headers['x-haku-peer-id'] || '');
        const nonce = String(req.headers['x-haku-grant-nonce'] || '');
        const epoch = Number(req.headers['x-haku-grant-epoch']);
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(peerId) || !nonce || !Number.isSafeInteger(epoch)) { json(res, 400, { error: 'invalid_grant' }); return; }
        const result = await gate.publish(actor, roomId, peerId, nonce, epoch, await body(req));
        res.writeHead(201, { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' });
        res.end(result.media.answer); return;
      }
      const data = JSON.parse(await body(req) || '{}');
      let result;
      switch (url.pathname) {
        case '/audience': result = gate.setAudience(actor, roomId, data.allowed); break;
        case '/consent': result = await gate.consent(actor, roomId, data.allowed); break;
        case '/qr': result = gate.qr(actor, roomId); break;
        case '/request': result = gate.request(actor, roomId, data.peerId, data.token, data.consent === true); break;
        case '/direct': result = gate.direct(actor, roomId, data.peerId); break;
        case '/heartbeat': result = gate.heartbeat(actor, roomId, data.peerId, data.epoch); break;
        case '/handoff': result = await gate.handoff(actor, roomId, data.nextPeer); break;
        case '/acknowledge-stop': result = gate.acknowledgeStop(actor, roomId, data.peerId); break;
        case '/stop': result = await gate.stop(actor, roomId); break;
        default: json(res, 404, { error: 'not_found' }); return;
      }
      json(res, 200, result);
    } catch (error) {
      const safeCode = error?.code || (/^(request_too_large|srs_disconnect_unconfirmed|invalid_whip_request)$/.test(error?.message || '') ? error.message : 'request_failed');
      json(res, error?.status || 403, { error: safeCode });
    }
  });
  server.on('listening', () => {
    timer = setInterval(() => { void gate.sweep().catch(() => {}); }, 2000);
    timer.unref();
  });
  server.on('close', () => clearInterval(timer));
  return { server, gate };
}
