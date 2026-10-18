import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'
import { requireAdmin } from '../ops/_guard.js'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, roomNameForPerformer } from './_shared.js'

const STALE_SECONDS = 90

function hasConfiguredValue(value: string | undefined) {
  if (!value) return false
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '')
  return Boolean(cleaned) && cleaned !== '[SENSITIVE]'
}

function sendLiveKitStatus(res: VercelResponse) {
  const hasUrl = hasConfiguredValue(process.env.LIVEKIT_URL) || hasConfiguredValue(process.env.VITE_LIVEKIT_URL)
  const hasKey = hasConfiguredValue(process.env.LIVEKIT_API_KEY)
  const hasSecret = hasConfiguredValue(process.env.LIVEKIT_API_SECRET)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ configured: hasUrl && hasKey && hasSecret, hasUrl, hasKey, hasSecret })
}

async function revokePrivateRoomTokensAndDelete(performerId: string) {
  const { url, apiKey, apiSecret } = getLiveKitConfig()
  const client = new RoomServiceClient(url, apiKey, apiSecret)
  const room = roomNameForPerformer(performerId)
  const identities = new Set<string>([
    `private-host-${performerId}`,
    `private-viewer-${performerId}`,
  ])
  const sb = getAdminSupabase()
  // Revoke deterministic identities even when a viewer disconnected before the
  // broadcast ended; otherwise an already-issued token could recreate/join the room.
  const { data: sessions } = await sb.from('live_sessions').select('id').eq('performer_id', performerId)
  const sessionIds = (sessions ?? []).map((session) => session.id)
  if (sessionIds.length) {
    const { data: allowlisted } = await sb
      .from('live_session_viewer_allowlist')
      .select('viewer_user_id')
      .in('session_id', sessionIds)
    for (const viewer of allowlisted ?? []) identities.add(`private-viewer-${viewer.viewer_user_id}`)
  }
  try {
    for (const participant of await client.listParticipants(room)) identities.add(participant.identity)
  } catch {
    // The room may already be empty. Deterministic identities are still revoked below.
  }
  const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin').eq('status', 'active')
  for (const admin of admins ?? []) {
    identities.add(`private-host-${admin.id}`)
    identities.add(`private-viewer-${admin.id}`)
  }
  const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000))
  for (const identity of identities) {
    try {
      await client.removeParticipant(room, identity, { revokeTokenTs })
    } catch {
      // LiveKit Cloud still records the explicit revocation cutoff when the
      // participant already left; older/self-hosted servers may return 404.
    }
  }
  try {
    await client.deleteRoom(room)
  } catch {
    // Already deleted/never created is a successful terminal state.
  }
}

async function endPrivateSession(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuthUser(req, res)
  if (!user) return
  const performerId = typeof req.body?.performerId === 'string' ? req.body.performerId : ''
  if (!performerId) {
    res.status(400).json({ error: 'performerId required' })
    return
  }
  const sb = getAdminSupabase()
  const { data: performer } = await sb.from('performers').select('id,is_private_test').eq('id', performerId).maybeSingle()
  if (!performer?.is_private_test) {
    res.status(404).json({ error: 'Private test performer not found' })
    return
  }
  const { data: adminProfile } = await sb.from('profiles').select('role,status').eq('id', user.id).maybeSingle()
  const isAdmin = adminProfile?.role === 'admin' && adminProfile?.status === 'active'
  if (user.id !== performerId && !isAdmin) {
    res.status(403).json({ error: 'Private test LIVE is restricted to the operator' })
    return
  }

  const endedAt = new Date().toISOString()
  const { error: sessionError } = await sb
    .from('live_sessions')
    .update({ ended_at: endedAt, ended_reason: 'private_test_ended' })
    .eq('performer_id', performerId)
    .is('ended_at', null)
  if (sessionError) throw sessionError
  const { error: performerError } = await sb.from('performers').update({
    is_live: false,
    share_location: false,
    live_started_at: null,
    live_title: null,
    lat: null,
    lng: null,
    location_updated_at: null,
  }).eq('id', performerId)
  if (performerError) throw performerError
  await revokePrivateRoomTokensAndDelete(performerId)
  res.status(200).json({ ok: true, endedAt })
}

async function expireStaleSessions() {
  const sb = getAdminSupabase()
  const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString()
  const { data: stale, error } = await sb
    .from('live_sessions')
    .select('id, performer_id')
    .is('ended_at', null)
    .lt('heartbeat_at', cutoff)
  if (error) throw error
  if (!stale?.length) return 0

  const ids = stale.map((row) => row.id)
  const performerIds = [...new Set(stale.map((row) => row.performer_id))]
  const endedAt = new Date().toISOString()
  const { error: endError } = await sb
    .from('live_sessions')
    .update({ ended_at: endedAt, ended_reason: 'heartbeat_timeout' })
    .in('id', ids)
    .is('ended_at', null)
  if (endError) throw endError

  for (const performerId of performerIds) {
    const { count } = await sb.from('live_sessions').select('id', { count: 'exact', head: true }).eq('performer_id', performerId).is('ended_at', null)
    if (!count) {
      await sb.from('performers').update({ is_live: false, share_location: false, lat: null, lng: null, location_updated_at: null }).eq('id', performerId)
      try {
        const { url, apiKey, apiSecret } = getLiveKitConfig()
        await new RoomServiceClient(url, apiKey, apiSecret).deleteRoom(roomNameForPerformer(performerId))
      } catch {
        // Stale database cleanup must still succeed if LiveKit is temporarily unavailable.
      }
    }
  }
  return ids.length
}

async function forceEndSession(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' })
    return
  }

  const sb = getAdminSupabase()
  const { data: session, error } = await sb.from('live_sessions').select('id, performer_id, ended_at').eq('id', sessionId).maybeSingle()
  if (error || !session) {
    res.status(404).json({ error: 'Live session not found' })
    return
  }
  if (!session.ended_at) {
    const endedAt = new Date().toISOString()
    const { error: endError } = await sb.from('live_sessions').update({ ended_at: endedAt, ended_reason: 'admin_forced' }).eq('id', session.id).is('ended_at', null)
    if (endError) throw endError
    await sb.from('performers').update({ is_live: false, share_location: false, lat: null, lng: null, location_updated_at: null }).eq('id', session.performer_id)
    try {
      const { url, apiKey, apiSecret } = getLiveKitConfig()
      await new RoomServiceClient(url, apiKey, apiSecret).deleteRoom(roomNameForPerformer(session.performer_id))
    } catch {
      // The database state remains authoritative if the room already disappeared.
    }
  }
  res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    if (req.method === 'GET' && req.query.mode === 'status') {
      sendLiveKitStatus(res)
      return
    }
    const expired = await expireStaleSessions()
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ ok: true, expired })
      return
    }

    if (req.body?.action === 'force-end') {
      await forceEndSession(req, res)
      return
    }
    if (req.body?.action === 'end-private') {
      await endPrivateSession(req, res)
      return
    }

    const user = await requireAuthUser(req, res)
    if (!user) return
    const performerId = typeof req.body?.performerId === 'string' ? req.body.performerId : ''
    if (!performerId || performerId !== user.id) {
      res.status(403).json({ error: 'Performer identity mismatch' })
      return
    }

    const sb = getAdminSupabase()
    const heartbeatAt = new Date().toISOString()
    const { data, error } = await sb
      .from('live_sessions')
      .update({ heartbeat_at: heartbeatAt })
      .eq('performer_id', performerId)
      .is('ended_at', null)
      .select('id')
    if (error) throw error
    if (!data?.length) {
      res.status(409).json({ error: 'No active live session' })
      return
    }
    res.status(200).json({ ok: true, heartbeatAt })
  } catch {
    res.status(503).json({ error: 'Live presence is temporarily unavailable' })
  }
}
