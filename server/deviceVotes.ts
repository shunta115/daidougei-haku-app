import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { getAdminSupabase } from '../api/stripe/_shared.js'

const COOKIE_NAME = 'haku_vote_device'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const AWP_EVENT_ID = '7ed8fc94-60b7-4729-b523-881cd3b4e72c'
const AWP_START = Date.parse('2026-10-12T10:00:00+09:00')
const AWP_END = Date.parse('2026-10-12T16:20:00+09:00')

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

function openNow(rule: Record<string, unknown> | null, eventId: string) {
  if (!rule?.voting_enabled || !rule.voting_open) return false
  const now = Date.now()
  if (eventId === AWP_EVENT_ID && (now < AWP_START || now >= AWP_END)) return false
  if (rule.voting_starts_at && now < Date.parse(String(rule.voting_starts_at))) return false
  if (rule.voting_ends_at && now >= Date.parse(String(rule.voting_ends_at))) return false
  return true
}

function tokyoDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}

async function eligiblePerformersToday(sb: ReturnType<typeof getAdminSupabase>, eventId: string, voteDate: string) {
  const { data: slots, error: slotError } = await sb.from('event_slots')
    .select('performer_id,start_time')
    .eq('event_id', eventId)
    .eq('date', voteDate)
    .eq('performance_type', 'regular')
    .or('status.is.null,status.neq.cancelled')
    .order('start_time', { ascending: true })
  if (slotError) throw slotError

  const ids = [...new Set((slots ?? []).map((row) => String(row.performer_id)).filter((id) => UUID_RE.test(id)))]
  if (!ids.length) return []
  const { data: performers, error: performerError } = await sb.from('performers')
    .select('id,stage_name')
    .in('id', ids)
    .eq('is_approved', true)
  if (performerError) throw performerError
  const byId = new Map((performers ?? []).map((performer) => [String(performer.id), String(performer.stage_name || '')]))
  return ids.flatMap((id) => byId.has(id) ? [{ id, stage_name: byId.get(id)! }] : [])
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
  const voteDate = tokyoDay()

  try {
    let eligiblePerformers: Awaited<ReturnType<typeof eligiblePerformersToday>> | null = null
    if (req.method === 'POST') {
      const performerId = String(req.body?.performerId || '')
      if (!UUID_RE.test(performerId)) {
        res.status(400).json({ error: 'invalid_performer' })
        return
      }
      if (eventId === AWP_EVENT_ID && (Date.now() < AWP_START || Date.now() >= AWP_END)) {
        res.status(403).json({ error: 'voting_closed' })
        return
      }
      eligiblePerformers = await eligiblePerformersToday(sb, eventId, voteDate)
      if (!eligiblePerformers.some((performer) => performer.id === performerId)) {
        res.status(422).json({ error: 'performer_not_eligible_today' })
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

    const [{ data: rule, error: ruleError }, { data: ballots, error: ballotError }] = await Promise.all([
      sb.from('event_vote_rules').select('voting_enabled,voting_open,votes_per_device,voting_starts_at,voting_ends_at').eq('event_id', eventId).maybeSingle(),
      sb.from('event_device_ballots').select('performer_id').eq('event_id', eventId).eq('device_hash', hash).eq('vote_date', voteDate),
    ])
    if (ruleError) throw ruleError
    if (ballotError) throw ballotError
    eligiblePerformers ??= await eligiblePerformersToday(sb, eventId, voteDate)
    const voted = (ballots ?? []).map((row) => String(row.performer_id))
    const max = Math.max(1, Math.min(10, Number(rule?.votes_per_device) || 3))
    res.status(200).json({
      voting_enabled: Boolean(rule?.voting_enabled),
      voting_open: openNow(rule as Record<string, unknown> | null, eventId),
      vote_date: voteDate,
      max_votes: max,
      used: voted.length,
      remaining: Math.max(0, max - voted.length),
      voted,
      eligible_performers: eligiblePerformers,
    })
  } catch {
    res.status(500).json({ error: 'vote_service_unavailable' })
  }
}
