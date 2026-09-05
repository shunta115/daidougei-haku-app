import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsMetrics = {
  signups: number
  tips_count: number
  tips_amount: number
  lives: number
  dau: number
  follows: number
  votes: number
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
  const viewPerformer = ev.view_performer ?? 0
  const clickTip = ev.click_tip ?? 0
  const tipSuccess = ev.tip_success ?? 0
  const tracked = Object.values(ev).reduce((s, n) => s + n, 0)

  return {
    signups: signups.count ?? 0,
    tips_count: tips.length,
    tips_amount: tips.reduce((s, t) => s + (t.amount_cents || 0), 0),
    lives: lives.count ?? 0,
    dau: dau.count ?? 0,
    follows: follows.count ?? 0,
    votes: votes.count ?? 0,
    view_home: ev.view_home ?? 0,
    view_performer: viewPerformer,
    click_tip: clickTip,
    tip_start: ev.tip_start ?? 0,
    tip_success: tipSuccess,
    live_view_start: ev.live_view_start ?? 0,
    signup_start: ev.signup_start ?? 0,
    signup_complete: ev.signup_complete ?? 0,
    follow_events: ev.follow ?? 0,
    vote_events: ev.vote ?? 0,
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
