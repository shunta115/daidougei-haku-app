import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../../api/stripe/_shared.js'

// TEST-only transport for the exact production RPCs. It never imports a Push
// sender, accepts recipient IDs, returns subscription secrets, or touches prod.
export default async function testApi(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  let testHost = false
  try { testHost = new URL(process.env.SUPABASE_URL || '').hostname === 'aeqskxxykzapgaudbeqa.supabase.co' } catch { /* closed */ }
  if (process.env.VERCEL_ENV !== 'preview' || process.env.ENABLE_SMART_PUSH_QA !== 'true' || !testHost) return res.status(404).json({ error: 'not_found' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  if (user.app_metadata?.smart_push_qa !== true) return res.status(403).json({ error: 'qa_identity_required' })
  if (typeof req.body?.liveSessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(req.body.liveSessionId)) return res.status(400).json({ error: 'invalid_session' })
  const sb = getAdminSupabase()
  const { data: session, error } = await sb.from('live_sessions').select('performer_id').eq('id', req.body.liveSessionId).maybeSingle()
  if (error || !session || session.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })
  const { data: eventId, error: enqError } = await sb.rpc('enqueue_live_start_push', { p_live_session_id: req.body.liveSessionId, p_owner_id: user.id })
  if (enqError) return res.status(503).json({ error: 'enqueue_failed', code: enqError.code })
  if (!eventId) return res.status(200).json({ enqueued: false, claimed: 0, providerCalls: 0 })
  const { data: rows, error: claimError } = await sb.rpc('claim_live_start_push_deliveries', { p_event_id: eventId, p_limit: 5 })
  if (claimError) return res.status(503).json({ error: 'claim_failed', code: claimError.code })
  const safe = (rows ?? []).every(row => row.endpoint.startsWith('https://push.invalid/smart-') && row.payload.performerId === user.id)
  if (!safe) return res.status(409).json({ error: 'non_synthetic_target', providerCalls: 0 })
  return res.status(200).json({ enqueued: true, claimed: rows?.length ?? 0, ownPerformerOnly: safe, providerCalls: 0 })
}
