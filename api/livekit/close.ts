import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'
import { closeSessionRoom } from './_close.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = await requireAuthUser(req, res)
  if (!user) return
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: 'Valid sessionId required' })
    return
  }
  try {
    const sb = getAdminSupabase()
    const { data: session, error } = await sb.from('live_sessions')
      .select('id,performer_id,ended_at').eq('id', sessionId).maybeSingle()
    if (error) throw error
    if (!session || session.performer_id !== user.id) {
      res.status(404).json({ error: 'Live session not found' })
      return
    }
    if (!session.ended_at) {
      res.status(409).json({ error: 'End the live session before closing its room' })
      return
    }
    await closeSessionRoom(user.id, sessionId)
    res.status(200).json({ ok: true })
  } catch {
    res.status(503).json({ error: 'LiveKit room closure is not yet confirmed' })
  }
}
