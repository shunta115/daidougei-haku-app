import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../api/stripe/_shared.js'

const DAY = '2026-10-12'
const START = '2026-10-12T00:00:00+09:00'
const PUBLISH = '2026-10-12T16:20:00+09:00'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })
  const eventId = String(req.query.eventId || '')
  if (!eventId) return res.status(400).json({ error: 'invalid_event' })
  if (Date.now() < Date.parse(PUBLISH)) return res.status(200).json({ day: DAY, published: false, ranking: [] })
  try {
    const sb = getAdminSupabase()
    const [slotResult, deviceResult, signedResult] = await Promise.all([
      sb.from('event_slots').select('performer_id').eq('event_id', eventId).eq('date', DAY).eq('performance_type', 'regular').or('status.is.null,status.neq.cancelled').not('performer_id', 'is', null),
      sb.from('event_device_ballots').select('performer_id').eq('event_id', eventId).eq('vote_date', DAY).gte('created_at', START).lt('created_at', PUBLISH),
      sb.from('event_ballots').select('performer_id').eq('event_id', eventId).eq('vote_date', DAY).gte('created_at', START).lt('created_at', PUBLISH),
    ])
    if (slotResult.error || deviceResult.error || signedResult.error) throw slotResult.error || deviceResult.error || signedResult.error
    const candidateIds = [...new Set((slotResult.data ?? []).map(r => String(r.performer_id)))]
    const { data: approved, error: approvedError } = candidateIds.length
      ? await sb.from('performers').select('id,stage_name').in('id', candidateIds).eq('is_approved', true)
      : { data: [], error: null }
    if (approvedError) throw approvedError
    const eligible = new Set((approved ?? []).map(r => String(r.id)))
    const counts = new Map<string, number>()
    for (const row of [...(deviceResult.data ?? []), ...(signedResult.data ?? [])]) if (eligible.has(String(row.performer_id))) counts.set(String(row.performer_id), (counts.get(String(row.performer_id)) ?? 0) + 1)
    const ids = [...counts.keys()]
    const performers = (approved ?? []).filter(row => ids.includes(String(row.id)))
    const names = new Map((performers ?? []).map(r => [String(r.id), String(r.stage_name || '')]))
    const ranking = [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,3).map(([performer_id], index) => ({ performer_id, performer_name: names.get(performer_id) || '名称未登録', ranking_position: index + 1 }))
    return res.status(200).json({ day: DAY, published: true, ranking })
  } catch { return res.status(500).json({ error: 'results_unavailable' }) }
}
