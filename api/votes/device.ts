import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { getAdminSupabase } from '../stripe/_shared.js'

const COOKIE_NAME = 'haku_vote_device'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const AWP_DATE_RE = /^2026-10-(10|11|12)$/

function cookieValue(req: VercelRequest, name: string) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

function deviceToken(req: VercelRequest, res: VercelResponse) {
  const existing = cookieValue(req, COOKIE_NAME)
  if (TOKEN_RE.test(existing)) return existing
  const token = randomBytes(32).toString('base64url')
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`)
  return token
}

function sameOrigin(req: VercelRequest) {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!origin || !host) return true
  try { return new URL(origin).host === host } catch { return false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!sameOrigin(req)) {
    res.status(403).json({ error: 'cross_site_request_rejected' })
    return
  }

  const eventId = String(req.method === 'GET' ? req.query.eventId || '' : req.body?.eventId || '')
  if (!UUID_RE.test(eventId)) {
    res.status(400).json({ error: 'invalid_event' })
    return
  }

  const token = deviceToken(req, res)
  const hash = createHash('sha256').update(token).digest('hex')
  const sb = getAdminSupabase()

  try {
    if (req.method === 'GET' && String(req.query.results || '') === '1') {
      const voteDate = String(req.query.date || '')
      if (!AWP_DATE_RE.test(voteDate)) return res.status(400).json({ error: 'invalid_vote_date' })
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
    }
    if (req.method === 'POST') {
      const performerId = String(req.body?.performerId || '')
      if (!UUID_RE.test(performerId)) {
        res.status(400).json({ error: 'invalid_performer' })
        return
      }
      const { error } = await sb.rpc('cast_device_event_vote', {
        p_event_id: eventId,
        p_performer_id: performerId,
        p_device_hash: hash,
      })
      if (error) {
        const message = error.message || 'vote_failed'
        const status = message.includes('already_voted') || message.includes('limit_reached') ? 409
          : message.includes('disabled') || message.includes('closed') || message.includes('not_started') || message.includes('ended') ? 403
            : message.includes('not_eligible') ? 422 : 400
        res.status(status).json({ error: message })
        return
      }
    }

    const { data: dayState, error: stateError } = await sb.rpc('get_event_vote_day_state', {
      p_event_id: eventId,
      p_vote_date: null,
    })
    if (stateError) throw stateError
    const state = (dayState ?? {}) as Record<string, unknown>
    const voteDate = String(state.vote_date || '')
    const [{ data: rule, error: ruleError }, { data: ballots, error: ballotError }, { data: eligible, error: eligibleError }] = await Promise.all([
      sb.from('event_vote_rules').select('voting_enabled,voting_open,votes_per_device').eq('event_id', eventId).maybeSingle(),
      sb.from('event_device_ballots').select('performer_id').eq('event_id', eventId).eq('vote_date', voteDate).eq('device_hash', hash),
      sb.from('event_slots').select('performer_id').eq('event_id', eventId).eq('date', voteDate).eq('performance_type', 'regular').not('performer_id', 'is', null).not('status', 'in', '(cancelled,canceled)'),
    ])
    if (ruleError) throw ruleError
    if (ballotError) throw ballotError
    if (eligibleError) throw eligibleError
    const voted = (ballots ?? []).map((row) => String(row.performer_id))
    const eligibleIds = [...new Set((eligible ?? []).map((row) => String(row.performer_id)).filter(Boolean))]
    const max = Math.max(1, Math.min(10, Number(rule?.votes_per_device) || 3))
    res.status(200).json({
      voting_enabled: Boolean(rule?.voting_enabled),
      voting_open: Boolean(state.voting_open),
      vote_date: voteDate,
      starts_at: state.starts_at ?? null,
      ends_at: state.ends_at ?? null,
      results_public: Boolean(state.results_public),
      result_status: String(state.result_status || 'pending'),
      eligible_performer_ids: eligibleIds,
      max_votes: max,
      used: voted.length,
      remaining: Math.max(0, max - voted.length),
      voted,
    })
  } catch {
    res.status(500).json({ error: 'vote_service_unavailable' })
  }
}
