import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'
import { requireAdmin } from '../ops/_guard.js'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getLiveKitConfig, sessionRoomName } from './_shared.js'

const STALE_SECONDS = 90
export function countAudienceParticipants(participants: { identity: string }[], performerId: string) {
  return participants.filter((participant) => participant.identity !== performerId).length
}
function readiness(res: VercelResponse) {
  const present = (value?: string) => Boolean(value?.trim() && value.trim() !== '[SENSITIVE]')
  const hasUrl = present(process.env.LIVEKIT_URL) || present(process.env.VITE_LIVEKIT_URL)
  const hasKey = present(process.env.LIVEKIT_API_KEY), hasSecret = present(process.env.LIVEKIT_API_SECRET)
  res.status(200).json({ configured: hasUrl && hasKey && hasSecret, hasUrl, hasKey, hasSecret })
}
function roomService() {
  const { url, apiKey, apiSecret } = getLiveKitConfig()
  return new RoomServiceClient(url, apiKey, apiSecret)
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (req.method === 'GET' && req.query.mode === 'status') { readiness(res); return }
  try {
    const sb = getAdminSupabase()
    if (req.method === 'GET') {
      // heartbeat_timeout cleanup is atomic with start/end and also scheduled by separately approved SQL.
      const { data, error } = await sb.rpc('expire_direct_live_leases')
      if (error) throw error
      res.status(200).json({ ok: true, expired: data }); return
    }
    if (req.body?.action === 'force-end') {
      if (!await requireAdmin(req, res)) return
      const sessionId = typeof req.body.sessionId === 'string' ? req.body.sessionId : ''
      const { data: session, error: readError } = await sb.from('live_sessions').select('id,performer_id').eq('id', sessionId).maybeSingle()
      if (readError || !session) { res.status(404).json({ error: 'Live session not found' }); return }
      const { error } = await sb.rpc('close_direct_live_session', { p_performer_id: session.performer_id, p_session_id: session.id, p_reason: 'admin_forced' })
      if (error) throw error
      try { await roomService().deleteRoom(sessionRoomName(session.performer_id, session.id)) } catch { /* DB is terminal; room may already be absent */ }
      res.status(200).json({ ok: true }); return
    }
    const user = await requireAuthUser(req, res)
    if (!user) return
    const { performerId, sessionId, operationId, action } = req.body || {}
    if (typeof performerId !== 'string' || performerId !== user.id || typeof sessionId !== 'string') {
      res.status(403).json({ error: 'Performer identity or session mismatch' }); return
    }
    const { data: session, error: readError } = await sb.from('direct_live_leases')
      .select('id,operation_id,lifecycle_state,ended_at,heartbeat_at').eq('id', sessionId).eq('performer_id', performerId).maybeSingle()
    if (readError) throw readError
    if (!session) { res.status(404).json({ error: 'Live session not found' }); return }
    if (action === 'cleanup-ended') {
      if (!session.ended_at) { res.status(409).json({ error: 'LIVE is not ended' }); return }
      await roomService().deleteRoom(sessionRoomName(performerId, sessionId))
      res.status(200).json({ ok: true }); return
    }
    if (session.ended_at || session.operation_id !== operationId || !session.heartbeat_at
      || Date.parse(session.heartbeat_at) < Date.now() - STALE_SECONDS * 1000) {
      res.status(409).json({ error: 'No active owned live session' }); return
    }
    const [{ data: performer }, { data: profile }] = await Promise.all([
      sb.from('performers').select('is_approved,is_live').eq('id', performerId).maybeSingle(),
      sb.from('profiles').select('role,status').eq('id', performerId).maybeSingle(),
    ])
    if (!performer?.is_approved || profile?.role !== 'performer' || profile.status !== 'active') {
      res.status(403).json({ error: 'Approved active performer required' }); return
    }
    if (session.lifecycle_state === 'live') {
      const { data: open, error } = await sb.from('live_sessions').select('id').eq('id', sessionId).is('ended_at', null).maybeSingle()
      if (error) throw error
      if (!open || !performer.is_live) { res.status(409).json({ error: 'LIVE was ended by the operator' }); return }
    }
    const participants = await roomService().listParticipants(sessionRoomName(performerId, sessionId))
    if (!participants.some((p) => p.identity === performerId)) {
      res.status(409).json({ error: 'Host is not connected' }); return
    }
    const heartbeatAt = new Date().toISOString()
    const { data, error } = await sb.from('direct_live_leases').update({ heartbeat_at: heartbeatAt })
      .eq('id', sessionId).eq('operation_id', operationId).is('ended_at', null).select('id')
    if (error) throw error
    if (!data?.length) { res.status(409).json({ error: 'No active live session' }); return }
    await sb.from('live_sessions').update({ heartbeat_at: heartbeatAt }).eq('id', sessionId).is('ended_at', null)
    const viewerCount = countAudienceParticipants(participants, performerId)
    await sb.from('live_sessions').update({ viewer_peak: viewerCount }).eq('id', sessionId).lt('viewer_peak', viewerCount)
    if (process.env.ENABLE_LIVE_VIEWER_SAMPLES === 'true' && session.lifecycle_state === 'live') {
      await sb.from('live_viewer_samples').insert({ live_session_id: sessionId, sampled_at: heartbeatAt, viewer_count: viewerCount })
        .then(() => undefined, () => undefined)
    }
    res.status(200).json({ ok: true, heartbeatAt, viewerCount })
  } catch { res.status(503).json({ error: 'Live presence is temporarily unavailable' }) }
}
