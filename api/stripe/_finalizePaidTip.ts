import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { publishLiveTipEvent } from './_tipEvents.js'

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null
}

/**
 * Claim a pending tip exactly once, then apply revenue side effects.
 * Safe for concurrent webhook + confirm.
 */
export async function finalizePaidTip(
  sb: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; already: boolean; tipId: string | null; amount: number }> {
  const tipId = session.metadata?.tip_id ?? null
  const performerId = session.metadata?.performer_id
  const fanId = session.metadata?.fan_id ?? null
  const anonymous = session.metadata?.anonymous === '1'
  const amount = session.amount_total ?? 0

  if (!tipId) return { ok: false, already: false, tipId: null, amount }

  const { data: claimed } = await sb
    .from('tips')
    .update({
      status: 'succeeded',
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntentId(session),
    })
    .eq('id', tipId)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle()

  if (!claimed?.id) {
    return { ok: true, already: true, tipId, amount }
  }

  if (performerId) {
    await sb.from('notifications').insert({
      user_id: performerId,
      title: 'New tip',
      body: `You received a tip of ¥${amount.toLocaleString('ja-JP')}.`,
    })

    const { data: open } = await sb
      .from('live_sessions')
      .select('id, tip_count, tip_amount_total')
      .eq('performer_id', performerId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (open?.id) {
      await sb
        .from('live_sessions')
        .update({
          tip_count: (open.tip_count ?? 0) + 1,
          tip_amount_total: (open.tip_amount_total ?? 0) + amount,
        })
        .eq('id', open.id)
    }

    await publishLiveTipEvent(sb, {
      tipId,
      performerId,
      fanId,
      amountYen: amount,
      isAnonymous: anonymous,
    })
  }

  return { ok: true, already: false, tipId, amount }
}
