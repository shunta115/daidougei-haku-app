import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSupabase, getDestination, requirePerformer, resolveYouTubeBroadcast } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requirePerformer(req, res)
  if (!user) return
  try {
    const row = await getDestination(user.id)
    if (!row?.encrypted_oauth) {
      res.status(409).json({ error: 'YouTube公式OAuth接続が必要です。' })
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    const actual = await resolveYouTubeBroadcast(row)
    const expectedBroadcastId = typeof req.body?.broadcastId === 'string' ? req.body.broadcastId : ''
    const confirm = req.method === 'POST'
    if (confirm && expectedBroadcastId !== actual.id) {
      res.status(409).json({ error: 'YouTube側の配信が変更されました。公開範囲を再確認してください。' })
      return
    }
    const visibilityMatches = actual.privacyStatus === row.visibility
    const { error } = await adminSupabase().from('multi_live_destinations').update({
      youtube_broadcast_id: actual.id,
      actual_visibility: actual.privacyStatus,
      visibility_confirmed_at: confirm && visibilityMatches ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('performer_id', user.id).eq('provider', 'youtube')
    if (error) throw error
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      ...actual,
      requestedVisibility: row.visibility,
      visibilityMatches,
      confirmed: confirm && visibilityMatches,
      canStart: confirm && visibilityMatches,
    })
  } catch (error) {
    console.error('youtube broadcast verification failed', { name: error instanceof Error ? error.name : 'unknown' })
    res.status(502).json({ error: 'YouTube側の配信と公開範囲を確認できませんでした。' })
  }
}
