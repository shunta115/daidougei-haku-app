// Isolated proof adapter: PR #87 authority gates PR #88 SRS publishing.
// Not a production service. SRS must remain on loopback behind this gate.
import { makeAuthority, LivePolicyError } from '../free-live/policy.mjs';

const TOKYO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const streamName = roomId => 'haku-lab-' + roomId.replaceAll('-', '');

export function makeSrsCrowdGate({
  now = Date.now, id = () => crypto.randomUUID(), openMedia, closeMedia,
} = {}) {
  if (typeof openMedia !== 'function' || typeof closeMedia !== 'function') throw Error('media_callbacks_required');
  const authority = makeAuthority({
    now, id, limits: { viewers: 500, roomMs: 60 * 60_000, dailyParticipantSeconds: Number.MAX_SAFE_INTEGER },
  });
  const dailyStarts = new Map();
  const active = new Map();
  const revocationPending = new Set();
  const dayKey = () => TOKYO_DAY.format(new Date(now()));

  async function close(roomId) {
    const current = active.get(roomId);
    if (!current) return;
    try {
      await closeMedia(current);
      active.delete(roomId);
      revocationPending.delete(roomId);
    } catch {
      revocationPending.add(roomId);
      throw new Error('srs_disconnect_unconfirmed');
    }
  }
  return {
    authority,
    streamName,
    create(actor, title) {
      const key = actor?.id + ':' + dayKey();
      if ((dailyStarts.get(key) || 0) >= 3) throw new LivePolicyError('daily_live_limit', 429);
      const room = authority.create(actor, title);
      dailyStarts.set(key, (dailyStarts.get(key) || 0) + 1);
      return room;
    },
    async consent(actor, roomId, allowed) {
      const state = authority.consent(actor, roomId, allowed);
      if (state.phase === 'ended') await close(roomId);
      return state;
    },
    qr: (...args) => authority.qr(...args),
    request: (...args) => authority.request(...args),
    direct: (...args) => authority.direct(...args),
    state: (...args) => authority.state(...args),
    async publish(actor, roomId, peerId, nonce, epoch, sdp) {
      const room = authority.state(actor, roomId);
      if (room.phase !== 'arming') throw new LivePolicyError('publish_grant_invalid');
      // Claim synchronously before awaiting SRS: concurrent POSTs cannot both publish.
      const claimed = authority.claim(actor, roomId, peerId, nonce, epoch);
      const stream = streamName(roomId);
      try {
        const media = await openMedia({ stream, sdp, roomId, actorId: actor.id, peerId, epoch });
        active.set(roomId, { ...media, stream, roomId, actorId: actor.id, peerId, epoch });
        if (authority.state(actor, roomId).phase !== 'live') {
          await close(roomId);
          throw new LivePolicyError('publish_revoked');
        }
        return { room: claimed, media };
      } catch (error) {
        try { await close(roomId); } catch { throw new Error('srs_disconnect_unconfirmed'); }
        authority.stop(actor, roomId, 'srs_publish_failed');
        throw error;
      }
    },
    heartbeat: (...args) => authority.heartbeat(...args),
    async stop(actor, roomId, reason = 'manual_stop') {
      const state = authority.stop(actor, roomId, reason);
      await close(roomId);
      return state;
    },
    async handoff(actor, roomId, nextPeer) {
      const state = authority.handoff(actor, roomId, nextPeer);
      // Break before make. No new grant until SRS confirms old media stopped.
      await close(roomId);
      return state;
    },
    acknowledgeStop(actor, roomId, peerId) {
      if (revocationPending.has(roomId) || active.has(roomId)) throw new LivePolicyError('srs_disconnect_unconfirmed', 503);
      return authority.acknowledgeStop(actor, roomId, peerId);
    },
    async sweep(actorByRoom) {
      authority.tick();
      for (const roomId of active.keys()) {
        const actor = actorByRoom(roomId);
        let phase;
        try { phase = actor ? authority.state(actor, roomId).phase : 'ended'; } catch { phase = 'ended'; }
        if (phase !== 'live') await close(roomId);
      }
    },
  };
}
