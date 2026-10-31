import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const validRoom = value => /^[a-f0-9-]{36}$/i.test(value || '');
const validActor = value => /^[a-f0-9-]{36}$/i.test(value || '');

export function makeWatchTickets({ secret = randomBytes(32), now = Date.now, lifetimeMs = 65 * 60_000 } = {}) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('watch_secret_required');
  const sign = payload => createHmac('sha256', secret).update(payload).digest();
  return {
    issue({ roomId, actorId, epoch, audienceGeneration = null }) {
      if (!validRoom(roomId) || !validActor(actorId) || !Number.isSafeInteger(epoch)) throw new Error('invalid_watch_claim');
      const payload = Buffer.from(JSON.stringify({ roomId, actorId, epoch, audienceGeneration, until: now() + lifetimeMs })).toString('base64url');
      return payload + '.' + sign(payload).toString('base64url');
    },
    verify(token, roomId, state, authorize = null) {
      if (typeof token !== 'string' || token.length > 512 || !validRoom(roomId)) return false;
      const parts = token.split('.');
      if (parts.length !== 2) return false;
      let supplied;
      try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return false; }
      if (supplied.length !== 32 || !timingSafeEqual(supplied, sign(parts[0]))) return false;
      let claim;
      try { claim = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return false; }
      return claim.roomId === roomId && validActor(claim.actorId) &&
        Number.isSafeInteger(claim.until) && claim.until > now() &&
        state?.phase === 'live' && state.epoch === claim.epoch &&
        (authorize ? authorize(claim.actorId, roomId, claim.epoch, claim.audienceGeneration) : (claim.actorId === state.performerId || claim.actorId === state.publisherId));
    },
  };
}

export function rewriteHlsPlaylist(source, baseUrl, token) {
  return source.split('\n').map(line => {
    if (!line || line.startsWith('#')) return line;
    const target = new URL(line, baseUrl);
    if (target.origin !== baseUrl.origin || !/^\/live\/haku-lab-[a-f0-9]{32}(?:-[0-9]+)?\.(?:m3u8|ts)$/.test(target.pathname)) throw new Error('invalid_hls_path');
    target.searchParams.set('watch', token);
    return target.pathname + target.search;
  }).join('\n');
}
