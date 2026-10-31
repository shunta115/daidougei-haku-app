// Existing HAKU authority plus durable SRS media fencing. No Egress or paid service.
// The HTTP gateway stays loopback-only until TLS/ICE and device acceptance pass.
import { randomBytes } from 'node:crypto';
import { makeAuthority, LivePolicyError } from '../free-live/policy.mjs';
import { makeMemoryCrowdStore } from './state-store.mjs';
const TOKYO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
const streamName = roomId => 'haku-lab-' + roomId.replaceAll('-', '');
const limits = { viewers: 500, roomMs: 60 * 60_000, dailyParticipantSeconds: Number.MAX_SAFE_INTEGER };

export function makeSrsCrowdGate({ now = Date.now, id = () => crypto.randomUUID(), openMedia, closeMedia, store = makeMemoryCrowdStore() } = {}) {
  if (typeof openMedia !== 'function' || typeof closeMedia !== 'function') throw Error('media_callbacks_required');
  // Reload and commit on every operation: no worker-local cached authorization.
  function atomic(fn) {
    const outcome = store.transaction(state => {
      const authority = makeAuthority({ now, id, limits, snapshot: state.authority });
      const ctx = { authority, daily: new Map(state.dailyStarts), active: new Map(state.active), pending: new Set(state.revocationPending), audience: new Map(state.audience), state };
      let value, error;
      try { value = fn(ctx); } catch (caught) { error = caught; }
      // Expiry observed while rejecting a request must also survive a restart.
      state.authority = authority.snapshot(); state.dailyStarts = [...ctx.daily]; state.active = [...ctx.active]; state.revocationPending = [...ctx.pending]; state.audience = [...ctx.audience];
      return { value, error };
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }
  const call = (method, ...args) => atomic(c => c.authority[method](...args));
  const roomRecord = (c, roomId) => c.authority.snapshot().rooms.find(([key]) => key === roomId)?.[1];
  const internalOwner = (c, roomId) => { const room = roomRecord(c, roomId); return room ? { id: room.performerId, role: 'performer', approved: true, active: true } : null; };
  const authority = Object.fromEntries(Object.entries(makeAuthority({ limits })).map(([key, value]) => [key, typeof value === 'function' ? (...args) => call(key, ...args) : value]));
  async function close(roomId, settledAttempt = null) {
    const current = atomic(c => { const entry = c.active.get(roomId); if (entry) c.pending.add(roomId); return entry; });
    if (!current) return;
    try { await closeMedia(current); } catch { throw new Error('srs_disconnect_unconfirmed'); }
    atomic(c => {
      const entry = c.active.get(roomId);
      if (!entry || entry.attempt !== current.attempt) return;
      // A stop can precede an outstanding SRS answer. Keep the fence durable;
      // only the publishing operation that settled may clear its pending entry.
      if (entry.opening && settledAttempt !== entry.attempt) throw new Error('srs_disconnect_unconfirmed');
      c.active.delete(roomId); c.pending.delete(roomId);
    });
  }
  return {
    authority, streamName,
    watchSecret() { return atomic(c => { c.state.watchSecret ||= randomBytes(32).toString('base64'); return Buffer.from(c.state.watchSecret, 'base64'); }); },
    roomIds() { return atomic(c => c.authority.snapshot().rooms.map(([key]) => key)); },
    ownerForRoom(roomId) { return atomic(c => internalOwner(c, roomId)); },
    create(actor, title) { return atomic(c => {
      const key = actor?.id + ':' + TOKYO_DAY.format(new Date(now()));
      if ((c.daily.get(key) || 0) >= 3) throw new LivePolicyError('daily_live_limit', 429);
      if (actor?.isPrivateTest) throw new LivePolicyError('private_live_not_supported');
      const room = c.authority.create(actor, title); c.daily.set(key, (c.daily.get(key) || 0) + 1); return room;
    }); },
    async consent(actor, roomId, allowed) { const state = call('consent', actor, roomId, allowed); if (state.phase === 'ended') await close(roomId); return state; },
    qr: (...args) => call('qr', ...args), request: (...args) => call('request', ...args), direct: (...args) => call('direct', ...args), state: (...args) => call('state', ...args),
    async publish(actor, roomId, peerId, nonce, epoch, sdp) {
      const stream = streamName(roomId), attempt = id();
      const claimed = atomic(c => {
        if (c.authority.state(actor, roomId).phase !== 'arming') throw new LivePolicyError('publish_grant_invalid');
        if (c.pending.has(roomId) || c.active.has(roomId)) throw new LivePolicyError('srs_disconnect_unconfirmed', 503);
        const result = c.authority.claim(actor, roomId, peerId, nonce, epoch);
        c.active.set(roomId, { stream, roomId, actorId: actor.id, peerId, epoch, attempt, opening: true }); return result;
      });
      try {
        const media = await openMedia({ stream, sdp, roomId, actorId: actor.id, peerId, epoch });
        const accepted = atomic(c => {
          const entry = c.active.get(roomId);
          if (!entry || entry.attempt !== attempt) return false;
          c.active.set(roomId, { ...entry, opening: false });
          const state = c.authority.state(actor, roomId);
          return !c.pending.has(roomId) && state.phase === 'live' && state.epoch === epoch;
        });
        if (!accepted) { await close(roomId, attempt); throw new LivePolicyError('publish_revoked'); }
        return { room: claimed, media };
      } catch (error) {
        try { await close(roomId, attempt); } catch { throw new Error('srs_disconnect_unconfirmed'); }
        atomic(c => { const room = roomRecord(c, roomId); if (room && room.phase !== 'ended') c.authority.stop(actor, roomId, 'srs_publish_failed'); }); throw error;
      }
    },
    heartbeat: (...args) => call('heartbeat', ...args),
    async stop(actor, roomId, reason = 'manual_stop') { const state = call('stop', actor, roomId, reason); await close(roomId); return state; },
    async handoff(actor, roomId, nextPeer) { const state = call('handoff', actor, roomId, nextPeer); await close(roomId); return state; },
    acknowledgeStop(actor, roomId, peerId) { return atomic(c => { if (c.pending.has(roomId) || c.active.has(roomId)) throw new LivePolicyError('srs_disconnect_unconfirmed', 503); return c.authority.acknowledgeStop(actor, roomId, peerId); }); },
    setAudience(actor, roomId, allowed) { return atomic(c => {
      const room = c.authority.state(actor, roomId);
      if (room.performerId !== actor.id || !actor.approved) throw new LivePolicyError('performer_only');
      c.audience.set(roomId, { public: allowed === true, generation: (c.audience.get(roomId)?.generation || 0) + 1, viewers: [] });
      return { public: allowed === true };
    }); },
    authorizeWatch(actor, roomId) { return atomic(c => {
      const room = c.authority.state(actor, roomId);
      if (room.phase !== 'live' || !c.active.has(roomId) || c.active.get(roomId).opening || c.pending.has(roomId)) throw new LivePolicyError('watch_not_authorized');
      if (actor.id === room.performerId || actor.id === room.publisherId) return room;
      const access = c.audience.get(roomId);
      if (!access?.public || !actor.active) throw new LivePolicyError('watch_not_authorized');
      const viewers = new Map(access.viewers.filter(([, until]) => until > now()));
      if (!viewers.has(actor.id) && viewers.size >= limits.viewers) throw new LivePolicyError('viewer_limit', 429);
      viewers.set(actor.id, now() + 120_000); access.viewers = [...viewers]; c.audience.set(roomId, access);
      return { ...room, audienceGeneration: access.generation };
    }); },
    canWatchClaim(actorId, roomId, epoch, generation) { return atomic(c => {
      const owner = internalOwner(c, roomId); if (!owner) return false;
      const room = c.authority.state(owner, roomId);
      if (room.phase !== 'live' || room.epoch !== epoch || !c.active.has(roomId) || c.active.get(roomId).opening || c.pending.has(roomId)) return false;
      if (actorId === room.performerId || actorId === room.publisherId) return true;
      const access = c.audience.get(roomId);
      return Boolean(access?.public && access.generation === generation && new Map(access.viewers).get(actorId) > now());
    }); },
    async sweep(actorByRoom) {
      call('tick');
      const entries = atomic(c => [...c.active]);
      for (const [roomId] of entries) {
        const actor = actorByRoom?.(roomId) || atomic(c => internalOwner(c, roomId));
        let phase; try { phase = actor ? call('state', actor, roomId).phase : 'ended'; } catch { phase = 'ended'; }
        if (phase !== 'live') await close(roomId);
      }
    },
  };
}
