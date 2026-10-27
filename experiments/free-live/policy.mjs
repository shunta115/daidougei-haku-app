/** Pure, synchronous authority. Deliberately separate from production HAKU data.
 * A single process owns each room: do NOT put this Map in a serverless function.
 * Transport authorization cannot retract media saved by a malicious P2P peer.
 */
export class LivePolicyError extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status }
}

export const FREE_LIVE_LIMITS = Object.freeze({
  viewers: 5, queue: 10, rooms: 20, roomMs: 60 * 60_000,
  leaseMs: 12_000, qrMs: 5 * 60_000, grantMs: 60_000,
  viewerMs: 20_000, dailyParticipantSeconds: 18_000,
})

export function makeAuthority({ now = Date.now, id = () => crypto.randomUUID(), limits = {} } = {}) {
  const cap = { ...FREE_LIVE_LIMITS, ...limits }
  const rooms = new Map()
  let day = '', consumedSeconds = 0, lastTick = now()
  function fail(code, status) { throw new LivePolicyError(code, status) }
  function authenticated(actor) { if (!actor?.id || actor.active !== true) fail('authentication_required', 401) }
  function owner(room, actor) {
    authenticated(actor)
    if (actor.id !== room.performerId || !actor.approved) fail('performer_only')
  }
  function finish(room, reason) {
    room.phase = 'ended'; room.reason = reason; room.epoch++
    room.publisher = null; room.grant = null; room.qr = null
    room.queue = []; room.viewers.clear(); room.endedAt = now()
  }
  function tick() {
    const t = now(), currentDay = new Date(t).toISOString().slice(0, 10)
    if (day !== currentDay) { day = currentDay; consumedSeconds = 0; lastTick = t }
    const elapsed = Math.max(0, t - lastTick) / 1000
    for (const room of rooms.values()) {
      if (room.phase === 'ended') continue
      consumedSeconds += elapsed * (room.viewers.size + (room.publisher ? 1 : 0))
      for (const [key, viewer] of room.viewers) if (viewer.until <= t) room.viewers.delete(key)
      room.queue = room.queue.filter(entry => entry.until > t)
      if (t >= room.deadline) finish(room, 'duration_limit')
      else if (room.publisher && room.publisher.until <= t) finish(room, 'publisher_disconnected')
      else if (room.phase === 'switching' && room.switchUntil <= t) finish(room, 'handoff_timeout')
      else if (room.grant && room.grant.until <= t) {
        room.grant = null
        if (room.phase === 'arming') room.phase = 'ready'
      }
    }
    lastTick = t
    if (consumedSeconds >= cap.dailyParticipantSeconds) {
      for (const room of rooms.values()) if (room.phase !== 'ended') finish(room, 'daily_safety_limit')
    }
    // Bound even ended state; no personal or media history is retained here.
    for (const [key, room] of rooms) if (room.phase === 'ended' && t - room.endedAt > 60_000) rooms.delete(key)
  }
  function roomById(roomId) {
    tick(); const room = rooms.get(roomId)
    if (!room) fail('room_not_found', 404)
    return room
  }
  function open(room) { if (room.phase === 'ended') fail('session_ended', 410) }
  function grant(room, actorId, peerId) {
    room.epoch++; room.phase = 'arming'
    room.grant = { actorId, peerId, nonce: id(), until: now() + cap.grantMs, epoch: room.epoch }
    return { ...room.grant }
  }
  function publicState(room, actor) {
    const isOwner = actor?.id === room.performerId
    return {
      id: room.id, performerId: room.performerId, title: room.title, phase: room.phase,
      epoch: room.epoch, deadline: room.deadline, reason: room.reason,
      crowdAllowed: room.crowdAllowed, viewers: room.viewers.size, viewerLimit: cap.viewers,
      publisherPeer: room.publisher?.peerId ?? null, publisherId: room.publisher?.actorId ?? null,
      publisherUntil: room.publisher?.until ?? null,
      queue: isOwner ? room.queue.map(({actorId, peerId}) => ({actorId, peerId})) : [],
      canClaim: room.grant?.actorId === actor?.id,
      dailyUsedSeconds: Math.ceil(consumedSeconds), dailyLimitSeconds: cap.dailyParticipantSeconds,
    }
  }
  return {
    limits: cap,
    tick,
    create(actor, title = 'HAKU テストパフォーマー') {
      tick(); authenticated(actor)
      if (!actor.approved || actor.role !== 'performer') fail('approved_performer_required')
      if (consumedSeconds >= cap.dailyParticipantSeconds) fail('daily_safety_limit', 429)
      if ([...rooms.values()].some(r => r.performerId === actor.id && r.phase !== 'ended')) fail('already_has_room', 409)
      if ([...rooms.values()].filter(r => r.phase !== 'ended').length >= cap.rooms) fail('room_capacity', 429)
      const room = { id: id(), performerId: actor.id, title: String(title).slice(0, 60),
        phase: 'ready', epoch: 0, deadline: now() + cap.roomMs, reason: null,
        crowdAllowed: false, qr: null, publisher: null, grant: null, queue: [],
        viewers: new Map(), switchUntil: 0, retired: null, reports: new Set() }
      rooms.set(room.id, room)
      return publicState(room, actor)
    },
    state(actor, roomId) { authenticated(actor); return publicState(roomById(roomId), actor) },
    consent(actor, roomId, allowed) {
      const room = roomById(roomId); owner(room, actor); open(room)
      room.crowdAllowed = allowed === true; room.qr = null; room.queue = []
      if (!room.crowdAllowed && ((room.publisher && room.publisher.actorId !== actor.id) ||
          (room.grant && room.grant.actorId !== actor.id))) finish(room, 'crowd_permission_revoked')
      return publicState(room, actor)
    },
    qr(actor, roomId) {
      const room = roomById(roomId); owner(room, actor); open(room)
      if (!room.crowdAllowed) fail('performer_consent_required')
      room.qr = { token: id() + id(), until: now() + cap.qrMs, remaining: cap.queue }
      return { token: room.qr.token, until: room.qr.until }
    },
    request(actor, roomId, peerId, token, consent) {
      authenticated(actor); const room = roomById(roomId); open(room)
      if (actor.id === room.performerId) fail('use_direct_start', 400)
      if (!consent) fail('privacy_consent_required')
      if (!room.crowdAllowed || !room.qr || room.qr.until <= now() || room.qr.token !== token) fail('invalid_or_expired_qr')
      if (room.publisher?.actorId === actor.id || room.grant?.actorId === actor.id || room.queue.some(e => e.actorId === actor.id)) fail('already_requested', 409)
      if (room.qr.remaining <= 0 || room.queue.length >= cap.queue) fail('queue_full', 429)
      room.qr.remaining--
      if (!room.publisher && !room.grant && room.phase === 'ready') return grant(room, actor.id, peerId)
      room.queue.push({ actorId: actor.id, peerId, until: Math.min(room.deadline, now() + cap.qrMs) })
      return { queued: true }
    },
    direct(actor, roomId, peerId) {
      const room = roomById(roomId); owner(room, actor); open(room)
      if (room.phase !== 'ready' || room.publisher || room.grant) fail('camera_busy', 409)
      return grant(room, actor.id, peerId)
    },
    claim(actor, roomId, peerId, nonce, epoch) {
      authenticated(actor); const room = roomById(roomId); open(room)
      const g = room.grant
      if (!g || g.actorId !== actor.id || g.peerId !== peerId || g.nonce !== nonce || g.epoch !== epoch || g.until <= now()) fail('publish_grant_invalid')
      room.grant = null; room.publisher = { actorId: actor.id, peerId, epoch, until: now() + cap.leaseMs }
      room.phase = 'live'
      return publicState(room, actor)
    },
    pendingGrant(actor, roomId, peerId) {
      authenticated(actor); const room = roomById(roomId); open(room)
      const g = room.grant
      return g?.actorId === actor.id && g.peerId === peerId ? { ...g } : null
    },
    heartbeat(actor, roomId, peerId, epoch) {
      authenticated(actor); const room = roomById(roomId); open(room)
      if (room.publisher?.actorId !== actor.id || room.publisher?.peerId !== peerId || room.epoch !== epoch || room.phase !== 'live') fail('publish_lease_revoked')
      room.publisher.until = now() + cap.leaseMs
      return publicState(room, actor)
    },
    join(actor, roomId, peerId) {
      authenticated(actor); const room = roomById(roomId); open(room)
      if (!room.viewers.has(peerId) && room.viewers.size >= cap.viewers) fail('viewer_limit', 429)
      if (room.publisher?.actorId === actor.id) fail('publisher_cannot_view', 409)
      const current = room.viewers.get(peerId)
      if (current && current.actorId !== actor.id) fail('peer_identity_mismatch')
      room.viewers.set(peerId, { actorId: actor.id, until: now() + cap.viewerMs })
      return publicState(room, actor)
    },
    leave(actor, roomId, peerId) {
      authenticated(actor); const room = roomById(roomId)
      if (room.viewers.get(peerId)?.actorId === actor.id) room.viewers.delete(peerId)
      return publicState(room, actor)
    },
    handoff(actor, roomId, nextPeer) {
      const room = roomById(roomId); owner(room, actor); open(room)
      if (room.phase !== 'live' || !room.publisher) fail('not_live', 409)
      const next = room.queue.find(q => q.peerId === nextPeer)
      if (!next) fail('camera_not_queued', 404)
      // Break before make. The old camera acknowledges physical stop first.
      room.retired = { ...room.publisher }; room.publisher = null
      room.phase = 'switching'; room.epoch++; room.grant = null
      room.next = next; room.switchUntil = now() + cap.leaseMs
      return publicState(room, actor)
    },
    acknowledgeStop(actor, roomId, peerId) {
      authenticated(actor); const room = roomById(roomId); open(room)
      if (room.phase !== 'switching' || room.retired?.actorId !== actor.id || room.retired?.peerId !== peerId) fail('stop_ack_invalid')
      const next = room.next; room.retired = null; room.next = null
      room.queue = room.queue.filter(q => q.peerId !== next.peerId)
      grant(room, next.actorId, next.peerId)
      return publicState(room, actor)
    },
    stop(actor, roomId, reason = 'manual_stop') {
      authenticated(actor); const room = roomById(roomId)
      if (actor.id !== room.performerId && actor.id !== room.publisher?.actorId && actor.id !== room.grant?.actorId && actor.role !== 'admin') fail('stop_forbidden')
      if (room.phase !== 'ended') finish(room, reason)
      return publicState(room, actor)
    },
    report(actor, roomId, reason) {
      authenticated(actor); const room = roomById(roomId)
      if (!['privacy', 'unsafe', 'inappropriate'].includes(reason)) fail('invalid_report', 400)
      // Local fail-safe quarantine. A production moderation queue is still needed.
      room.reports.add(actor.id); if (room.phase !== 'ended') finish(room, 'report_quarantine')
      return { accepted: true, quarantined: true }
    },
    authorizeSignal(actor, roomId, from, to, epoch, type) {
      authenticated(actor); const room = roomById(roomId); open(room)
      if (room.phase !== 'live' || epoch !== room.epoch || !room.publisher) fail('stale_signal')
      const pub = room.publisher
      const senderIsHost = from === pub.peerId && actor.id === pub.actorId
      const senderIsViewer = room.viewers.get(from)?.actorId === actor.id
      if (senderIsHost && room.viewers.has(to) && ['offer', 'candidate'].includes(type)) return true
      if (senderIsViewer && to === pub.peerId && ['answer', 'candidate', 'reconnect'].includes(type)) return true
      fail('signal_forbidden')
    },
    viewerPeers(actor, roomId, peerId) {
      const room = roomById(roomId)
      if (room.publisher?.actorId !== actor.id || room.publisher.peerId !== peerId) fail('publisher_only')
      return [...room.viewers].map(([peerId, viewer]) => ({ peerId, actorId: viewer.actorId }))
    },
  }
}
