import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^2026-10-(10|11|12)$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })
  const eventId = String(req.query.eventId || '')
  const voteDate = String(req.query.date || '')
  if (!UUID_RE.test(eventId) || !DATE_RE.test(voteDate)) return res.status(400).json({ error: 'invalid_request' })
  const sb = getAdminSupabase()
  try {
    const { data: initialState, error: initialError } = await sb.rpc('get_event_vote_day_state', {
      p_event_id: eventId, p_vote_date: voteDate,
    })
    if (initialError) throw initialError
    let state = (initialState ?? {}) as Record<string, unknown>
    if (state.configured && Date.parse(String(state.server_now)) >= Date.parse(String(state.ends_at)) && !state.results_public) {
      const { data, error } = await sb.rpc('finalize_event_vote_day', { p_event_id: eventId, p_vote_date: voteDate })
      if (error) throw error
      state = (data ?? state) as Record<string, unknown>
    }
    if (!state.results_public) return res.status(200).json({ ...state, ranking: [] })
    const { data: ranking, error } = await sb.rpc('get_public_event_results_by_day', {
      p_event_id: eventId, p_vote_date: voteDate,
    })
    if (error) throw error
    return res.status(200).json({ ...state, ranking: ranking ?? [] })
  } catch {
    return res.status(503).json({ error: 'vote_results_unavailable', ranking: [] })
  }
}
