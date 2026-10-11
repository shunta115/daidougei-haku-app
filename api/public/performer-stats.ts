import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Metric = number | null

type SupportRow = {
  fan_id: string | null
  gross_amount_yen?: number | null
  amount_cents?: number | null
  refunded_amount_yen?: number | null
}

export function countCompletedAppearances(rows: Array<{ event_slot_id: string | null }>): number {
  return new Set(rows.map((row) => row.event_slot_id).filter(Boolean)).size
}

export function countConfirmedSupporters(rows: SupportRow[]): number | null {
  const confirmed = rows.filter((row) => {
      const gross = Number(row.gross_amount_yen ?? row.amount_cents) || 0
      const refunded = Number(row.refunded_amount_yen) || 0
      return gross > refunded
    })
  if (confirmed.some((row) => !row.fan_id)) return null
  return new Set(confirmed
    .map((row) => row.fan_id as string)).size
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const performerId = typeof req.query.performerId === 'string' ? req.query.performerId : ''
  if (!UUID.test(performerId)) {
    res.status(400).json({ error: 'invalid_performer' })
    return
  }

  const sb = getAdminSupabase()
  const { data: performer, error: performerError } = await sb
    .from('performers')
    .select('id')
    .eq('id', performerId)
    .eq('is_approved', true)
    .maybeSingle()
  if (performerError) {
    res.status(503).json({ error: 'stats_unavailable' })
    return
  }
  if (!performer) {
    res.status(404).json({ error: 'performer_not_found' })
    return
  }

  const [followers, completedLives, supporters, liveViews] = await Promise.all([
    sb.from('follows').select('fan_id', { count: 'exact', head: true }).eq('performer_id', performerId),
    sb.from('live_sessions').select('event_slot_id').eq('performer_id', performerId).not('ended_at', 'is', null).not('event_slot_id', 'is', null),
    sb.from('tips')
      .select('fan_id,gross_amount_yen,amount_cents,refunded_amount_yen')
      .eq('performer_id', performerId)
      .eq('status', 'succeeded')
      .eq('settlement_status', 'settled')
      .like('stripe_session_id', 'cs_live_%')
      .is('dispute_status', null)
      .limit(5000),
    sb.from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('performer_id', performerId)
      .in('name', ['live_view', 'live_view_start']),
  ])

  const followerCount: Metric = followers.error ? null : followers.count ?? 0
  const appearanceCount: Metric = completedLives.error
    ? null
    : countCompletedAppearances(completedLives.data ?? [])
  const supportCount: Metric = supporters.error
    ? null
    : countConfirmedSupporters(supporters.data ?? [])
  const liveViewCount: Metric = liveViews.error ? null : liveViews.count ?? 0

  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).json({
    followers: followerCount,
    appearances: appearanceCount,
    supporters: supportCount,
    liveViews: liveViewCount,
  })
}
