import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../ops/_guard.js'
import { getAdminSupabase } from '../stripe/_shared.js'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, roomNameForPerformer } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const admin = await requireAdmin(req, res)
  if (!admin) return
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' })
    return
  }
  try {
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
  } catch {
    res.status(500).json({ error: 'LIVEを終了できませんでした。再読み込みしてもう一度お試しください。' })
  }
}
