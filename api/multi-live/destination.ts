import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSupabase, encryptSecret, getDestination, requirePerformer, safeDestination, validateYouTubeStreamKey } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requirePerformer(req, res)
    if (!user) return
    if (req.method === 'GET') {
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    if (req.method === 'PUT') {
      const { streamKey, displayName, visibility, enabled } = req.body as Record<string, unknown>
      if (typeof streamKey !== 'string' || !validateYouTubeStreamKey(streamKey.trim())) {
        res.status(400).json({ error: '有効なYouTubeストリームキーを入力してください。' })
        return
      }
      if (!['public', 'unlisted', 'private'].includes(String(visibility))) {
        res.status(400).json({ error: '公開範囲を選択してください。' })
        return
      }
      const current = await getDestination(user.id)
      const { data, error } = await adminSupabase().from('multi_live_destinations').upsert({
        performer_id: user.id,
        provider: 'youtube',
        display_name: String(displayName || 'YouTube LIVE').trim().slice(0, 80) || 'YouTube LIVE',
        visibility,
        enabled: enabled !== false,
        encrypted_ingest: encryptSecret({ streamKey: streamKey.trim() }),
        encrypted_oauth: current?.encrypted_oauth || null,
        egress_id: null,
        status: 'ready',
        last_error_code: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'performer_id,provider' }).select('*').single()
      if (error) throw error
      res.status(200).json(safeDestination(data as never))
      return
    }
    if (req.method === 'DELETE') {
      const current = await getDestination(user.id)
      if (current?.egress_id) {
        res.status(409).json({ error: '同時配信を停止してから削除してください。' })
        return
      }
      const { error } = await adminSupabase().from('multi_live_destinations').delete().eq('performer_id', user.id).eq('provider', 'youtube')
      if (error) throw error
      res.status(204).end()
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('multi-live destination failed', { name: error instanceof Error ? error.name : 'unknown' })
    res.status(500).json({ error: '同時配信先を更新できませんでした。' })
  }
}
