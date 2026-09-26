import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, roomNameForPerformer } from './_shared.js'

const STALE_SECONDS = 90

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const expired = await expireStaleSessions()
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ ok: true, expired })
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
