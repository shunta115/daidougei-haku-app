import type { SupabaseClient } from '@supabase/supabase-js'

type Tier = 'normal' | 'premium' | 'special'

function tierFor(amountYen: number): Tier {
  if (amountYen >= 5000) return 'special'
  if (amountYen >= 1000) return 'premium'
  return 'normal'
}

function labelFor(amountYen: number, tier: Tier): string {
  if (tier === 'special') return 'スペシャルギフト'
  if (tier === 'premium') return '豪華ギフト'
  if (amountYen >= 500) return '応援ギフト'
  return '投げ銭'
}

/**
 * After Stripe confirms payment, publish a realtime tip gift event + chat line.
 * Idempotent on tip_id (unique). Service role only.
 */
export async function publishLiveTipEvent(
  sb: SupabaseClient,
  opts: {
    tipId: string
    performerId: string
    fanId?: string | null
    amountYen: number
    isAnonymous?: boolean
  },
) {
  const amountYen = Math.max(0, Math.floor(opts.amountYen))
  if (!amountYen || !opts.tipId || !opts.performerId) return

  const { data: existing } = await sb.from('live_tip_events').select('id').eq('tip_id', opts.tipId).maybeSingle()
  if (existing?.id) return

  const { data: performerLive } = await sb
    .from('performers')
    .select('is_live')
    .eq('id', opts.performerId)
    .maybeSingle()

  // Still publish if not live so host history works; viewers only show while watching.
  let displayName = '匿名ファン'
  let avatarUrl: string | null = null
  const anonymous = Boolean(opts.isAnonymous)

  if (!anonymous && opts.fanId) {
    const { data: profile } = await sb
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', opts.fanId)
      .maybeSingle()
    displayName = profile?.display_name?.trim() || 'ファン'
    avatarUrl = profile?.avatar_url ?? null
  }

  const { data: open } = await sb
    .from('live_sessions')
    .select('id')
    .eq('performer_id', opts.performerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const tier = tierFor(amountYen)
  const giftLabel = labelFor(amountYen, tier)

  const { error } = await sb.from('live_tip_events').insert({
    tip_id: opts.tipId,
    performer_id: opts.performerId,
    live_session_id: open?.id ?? null,
    fan_id: anonymous ? null : opts.fanId ?? null,
    display_name: displayName,
    avatar_url: avatarUrl,
    amount_cents: amountYen,
    gift_label: giftLabel,
    is_anonymous: anonymous,
    tier,
  })
  if (error) {
    // Unique race with webhook+confirm — ignore duplicate
    if (!String(error.message || '').toLowerCase().includes('duplicate')) {
      console.error('live_tip_events insert failed', error.message)
    }
    return
  }

  // Mirror into comments feed for history (system-style line).
  if (performerLive?.is_live) {
    const body = `${displayName}さんが¥${amountYen.toLocaleString('ja-JP')}を贈りました！（${giftLabel}）`
    await sb.from('live_comments').insert({
      performer_id: opts.performerId,
      live_session_id: open?.id ?? null,
      user_id: opts.fanId || opts.performerId,
      display_name: '🎁 ギフト',
      body: body.slice(0, 200),
    })
  }
}
