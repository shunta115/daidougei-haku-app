import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsMetrics = {
  signups: number
  tips_count: number
  tips_amount: number
  lives: number
  dau: number
  follows: number
  votes: number
  home_view: number
  performer_view: number
  live_view: number
  follow_click: number
  follow_complete: number
  tip_cta_click: number
  tip_amount_select: number
  tip_checkout_start: number
  tip_complete: number
  merch_view: number
  merch_checkout_start: number
  merch_purchase: number
  vote_complete: number
  view_home: number
  view_performer: number
  click_tip: number
  tip_start: number
  tip_success: number
  live_view_start: number
  signup_start: number
  signup_complete: number
  follow_events: number
  vote_events: number
  cvr_view_to_click: number | null
  cvr_click_to_success: number | null
  cvr_view_to_success: number | null
  events_tracked: number
}

const EVENT_NAMES = [
  'home_view',
  'live_view',
  'performer_view',
  'follow_click',
  'follow_complete',
  'tip_cta_click',
  'tip_amount_select',
  'tip_checkout_start',
  'tip_complete',
  'merch_view',
  'merch_checkout_start',
  'merch_purchase',
  'vote_complete',
  'view_home',
  'view_performer',
  'click_tip',
  'tip_start',
  'tip_success',
  'signup_start',
  'signup_complete',
  'follow',
  'vote',
  'live_view_start',
] as const

function ratio(num: number, den: number): number | null {
  if (den < 10) return null
  return Math.round((num / den) * 1000) / 1000
}

function nextDayIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}T00:00:00+09:00`
}

async function eventCounts(sb: SupabaseClient, day: string): Promise<Record<string, number>> {
  const from = `${day}T00:00:00+09:00`
  const to = nextDayIso(day)
  const out: Record<string, number> = {}
  for (const name of EVENT_NAMES) {
    const { count, error } = await sb
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('name', name)
      .gte('created_at', from)
      .lt('created_at', to)
    out[name] = error ? 0 : count ?? 0
  }
  return out
}

export async function buildDayMetrics(sb: SupabaseClient, day: string): Promise<OpsMetrics> {
  const from = `${day}T00:00:00+09:00`
  const to = nextDayIso(day)

  const [signups, tipsRes, lives, dau, follows, votes, ev] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
    sb.from('tips').select('amount_cents').eq('status', 'succeeded').gte('created_at', from).lt('created_at', to),
    sb.from('live_sessions').select('id', { count: 'exact', head: true }).gte('started_at', from).lt('started_at', to),
    sb.from('profiles').select('id', { count: 'exact', head: true }).gte('updated_at', from).lt('updated_at', to),
    sb.from('follows').select('fan_id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
    sb.from('event_votes').select('fan_id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
    eventCounts(sb, day),
  ])

  const tips = (tipsRes.data ?? []) as Array<{ amount_cents: number }>
  const homeView = (ev.home_view ?? 0) + (ev.view_home ?? 0)
  const viewPerformer = (ev.performer_view ?? 0) + (ev.view_performer ?? 0)
  const liveView = (ev.live_view ?? 0) + (ev.live_view_start ?? 0)
  const clickTip = (ev.tip_cta_click ?? 0) + (ev.click_tip ?? 0)
  const checkoutStart = (ev.tip_checkout_start ?? 0) + (ev.tip_start ?? 0)
  const tipSuccess = (ev.tip_complete ?? 0) + (ev.tip_success ?? 0)
  const followComplete = (ev.follow_complete ?? 0) + (ev.follow ?? 0)
  const voteComplete = (ev.vote_complete ?? 0) + (ev.vote ?? 0)
  const tracked = Object.values(ev).reduce((s, n) => s + n, 0)

  return {
    signups: signups.count ?? 0,
    tips_count: tips.length,
    tips_amount: tips.reduce((s, t) => s + (t.amount_cents || 0), 0),
    lives: lives.count ?? 0,
    dau: dau.count ?? 0,
    follows: follows.count ?? 0,
    votes: votes.count ?? 0,
    home_view: homeView,
    performer_view: viewPerformer,
    live_view: liveView,
    follow_click: ev.follow_click ?? 0,
    follow_complete: followComplete,
    tip_cta_click: clickTip,
    tip_amount_select: ev.tip_amount_select ?? 0,
    tip_checkout_start: checkoutStart,
    tip_complete: tipSuccess,
    merch_view: ev.merch_view ?? 0,
    merch_checkout_start: ev.merch_checkout_start ?? 0,
    merch_purchase: ev.merch_purchase ?? 0,
    vote_complete: voteComplete,
    view_home: homeView,
    view_performer: viewPerformer,
    click_tip: clickTip,
    tip_start: checkoutStart,
    tip_success: tipSuccess,
    live_view_start: liveView,
    signup_start: ev.signup_start ?? 0,
    signup_complete: ev.signup_complete ?? 0,
    follow_events: followComplete,
    vote_events: voteComplete,
    cvr_view_to_click: ratio(clickTip, viewPerformer),
    cvr_click_to_success: ratio(tipSuccess, clickTip),
    cvr_view_to_success: ratio(tipSuccess, viewPerformer),
    events_tracked: tracked,
  }
}

export async function upsertSnapshot(sb: SupabaseClient, day: string, metrics: OpsMetrics) {
  const { error } = await sb.from('ops_daily_snapshots').upsert({ day, metrics, created_at: new Date().toISOString() })
  if (error) throw error
}

export async function readSnapshot(sb: SupabaseClient, day: string): Promise<OpsMetrics | null> {
  const { data, error } = await sb.from('ops_daily_snapshots').select('metrics').eq('day', day).maybeSingle()
  if (error || !data?.metrics) return null
  return data.metrics as OpsMetrics
}

export function pctChange(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return today > 0 ? 100 : null
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10
}
