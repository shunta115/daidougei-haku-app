import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'
import { requireAdmin } from '../ops/_guard.js'
import { EgressClient, RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, roomNameForPerformer } from './_shared.js'

const STALE_SECONDS = 90

type LiveKitParticipant = { identity: string }

/** The host is connected to the same room and must never inflate audience data. */
export function countAudienceParticipants(participants: LiveKitParticipant[], performerId: string) {
  return participants.filter((participant) => participant.identity !== performerId).length
}

function present(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().replace(/^['"]|['"]$/g, '')
  return Boolean(normalized) && normalized !== '[SENSITIVE]'
}

function readiness(res: VercelResponse) {
  const hasUrl = present(process.env.LIVEKIT_URL) || present(process.env.VITE_LIVEKIT_URL)
  const hasKey = present(process.env.LIVEKIT_API_KEY)
  const hasSecret = present(process.env.LIVEKIT_API_SECRET)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ configured: hasUrl && hasKey && hasSecret, hasUrl, hasKey, hasSecret })
}

async function expireStaleSessions() {
  const sb = getAdminSupabase()
  const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString()
  const { data: stale, error } = await sb
    .from('live_sessions')
    .select('id, performer_id, started_at, heartbeat_at')
    .is('ended_at', null)
    .or(`heartbeat_at.lt.${cutoff},and(heartbeat_at.is.null,started_at.lt.${cutoff})`)
  if (error) throw error
  if (!stale?.length) return 0

  let roomService: RoomServiceClient | null = null
  try {
    const { url, apiKey, apiSecret } = getLiveKitConfig()
    roomService = new RoomServiceClient(url, apiKey, apiSecret)
  } catch {
    // If configuration is unavailable, heartbeat age remains authoritative.
  }

  const trulyStale: typeof stale = []
  for (const row of stale) {
    try {
      const participants = roomService ? await roomService.listParticipants(roomNameForPerformer(row.performer_id)) : []
      const hostConnected = participants.some((participant) => participant.identity === row.performer_id)
      if (hostConnected) {
        await sb.from('live_sessions').update({ heartbeat_at: new Date().toISOString() }).eq('id', row.id).is('ended_at', null)
        continue
      }
    } catch {
      // Fail safe during a LiveKit API outage: do not terminate a possibly healthy broadcast.
      if (roomService) continue
    }
    trulyStale.push(row)
  }
  if (!trulyStale.length) return 0

  const ids = trulyStale.map((row) => row.id)
  const performerIds = [...new Set(trulyStale.map((row) => row.performer_id))]
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
        if (roomService) await roomService.deleteRoom(roomNameForPerformer(performerId))
      } catch {
        // Stale database cleanup must still succeed if LiveKit is temporarily unavailable.
      }
    }
  }
  return ids.length
}

async function reapInactiveMultiLiveEgresses() {
  const sb = getAdminSupabase()
  const { data: destinations, error } = await sb
    .from('multi_live_destinations')
    .select('performer_id,egress_id')
    .not('egress_id', 'is', null)
  // The feature migration may not exist in older/test environments.
  if (error || !destinations?.length) return 0
  const performerIds = [...new Set(destinations.map((row) => row.performer_id))]
  const { data: inactive, error: performerError } = await sb
    .from('performers')
    .select('id')
    .in('id', performerIds)
    .eq('is_live', false)
  if (performerError || !inactive?.length) return 0
  const inactiveIds = new Set(inactive.map((row) => row.id))
  const targets = destinations.filter((row) => inactiveIds.has(row.performer_id) && row.egress_id)
  if (!targets.length) return 0
  const { url, apiKey, apiSecret } = getLiveKitConfig()
  const client = new EgressClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret)
  let stopped = 0
  for (const target of targets) {
    try {
      await client.stopEgress(target.egress_id)
      await sb.from('multi_live_destinations').update({ egress_id: null, status: 'stopped', last_error_code: null }).eq('performer_id', target.performer_id).eq('provider', 'youtube')
      stopped += 1
    } catch {
      await sb.from('multi_live_destinations').update({ status: 'failed', last_error_code: 'stop_failed' }).eq('performer_id', target.performer_id).eq('provider', 'youtube')
    }
  }
  return stopped
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
  if (req.method === 'GET' && req.query.mode === 'status') {
    readiness(res)
    return
  }
  if (req.method === 'GET' && process.env.CRON_SECRET) {
    const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'Cron authorization required' })
      return
    }
  }
  try {
    const expired = await expireStaleSessions()
    const stoppedExternal = await reapInactiveMultiLiveEgresses()
    await getAdminSupabase().from('multi_live_oauth_sessions').delete().lt('expires_at', new Date().toISOString()).then(() => undefined, () => undefined)
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ ok: true, expired, stoppedExternal })
      return
    }

    if (req.body?.action === 'force-end') {
      await forceEndSession(req, res)
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
    const [{ data: performer }, { data: profile }] = await Promise.all([
      sb.from('performers').select('is_approved').eq('id', performerId).maybeSingle(),
      sb.from('profiles').select('role,status').eq('id', performerId).maybeSingle(),
    ])
    if (!performer?.is_approved || profile?.role !== 'performer' || profile?.status !== 'active') {
      res.status(403).json({ error: 'Approved active performer required' })
      return
    }
    const heartbeatAt = new Date().toISOString()
    let viewerCount: number | null = null
    try {
      const { url, apiKey, apiSecret } = getLiveKitConfig()
      const participants = await new RoomServiceClient(url, apiKey, apiSecret)
        .listParticipants(roomNameForPerformer(performerId))
      viewerCount = countAudienceParticipants(participants, performerId)
    } catch {
      // A LiveKit management API outage must not prevent the host heartbeat.
    }
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
    if (viewerCount != null) {
      // The predicate makes competing host tabs monotonic: a stale lower count
      // cannot overwrite a higher peak recorded by another heartbeat.
      await sb
        .from('live_sessions')
        .update({ viewer_peak: viewerCount })
        .eq('id', data[0].id)
        .lt('viewer_peak', viewerCount)
      if (process.env.ENABLE_LIVE_VIEWER_SAMPLES === 'true') {
        // This capability is enabled only after the separately approved analytics
        // migration exists. Sampling failure must never interrupt the host heartbeat.
        await sb.from('live_viewer_samples').insert({
          live_session_id: data[0].id,
          sampled_at: heartbeatAt,
          viewer_count: viewerCount,
        }).then(() => undefined, () => undefined)
      }
    }
    res.status(200).json({ ok: true, heartbeatAt, viewerCount })
  } catch {
    res.status(503).json({ error: 'Live presence is temporarily unavailable' })
  }
}
