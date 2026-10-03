import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { MIN_PAYOUT_YEN, canRequestPayout, eligiblePayoutYen, remainingShareYen, remainingToMinPayout } from '../../shared/payoutMath.js'
import { missingColumn, missingTable, yenFromStripe } from './_settlement.js'

type SaleRow = {
  id: string
  status: string
  gross_amount_yen?: number | null
  amount_cents?: number | null
  amount_yen?: number | null
  performer_share_yen?: number | null
  refunded_amount_yen?: number | null
  dispute_status?: string | null
}

type PayoutRow = {
  id: string
  amount_yen: number
  status: string
  stripe_payout_id: string | null
  created_at: string
}

function saleGross(row: SaleRow): number {
  return yenFromStripe(row.gross_amount_yen ?? row.amount_cents ?? row.amount_yen)
}

function confirmedShare(row: SaleRow): number {
  if (row.status === 'pending' || row.status === 'failed' || row.status === 'expired') return 0
  const share = row.performer_share_yen
  if (Number.isInteger(share) && (share ?? 0) >= 0) return share ?? 0
  return 0
}

function availableShare(row: SaleRow): number {
  const share = confirmedShare(row)
  if (share <= 0) return 0
  return remainingShareYen({
    performerShareYen: share,
    grossYen: saleGross(row),
    refundedYen: yenFromStripe(row.refunded_amount_yen),
    status: row.status,
    disputeStatus: row.dispute_status,
  })
}

async function jpyAvailable(stripe: Stripe, accountId: string | null): Promise<number> {
  if (!accountId) return 0
  const balance = await stripe.balance.retrieve({ stripeAccount: accountId })
  return yenFromStripe(balance.available.find((item) => item.currency === 'jpy')?.amount)
}

export async function getPerformerPayoutView(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { performerId: string; stripeAccountId: string | null },
) {
  const [{ data: tips, error: tipError }, { data: orders, error: orderError }] = await Promise.all([
    sb.from('tips').select('id, status, gross_amount_yen, amount_cents, performer_share_yen, refunded_amount_yen, dispute_status').eq('performer_id', args.performerId),
    sb.from('merch_orders').select('id, status, gross_amount_yen, amount_yen, performer_share_yen, refunded_amount_yen, dispute_status').eq('seller_id', args.performerId),
  ])
  const salesMissing = Boolean((tipError && missingColumn(tipError)) || (orderError && missingColumn(orderError)))
  if (tipError && !missingColumn(tipError)) throw tipError
  if (orderError && !missingColumn(orderError)) throw orderError

  const sales = salesMissing ? [] : [...((tips ?? []) as SaleRow[]), ...((orders ?? []) as SaleRow[])]
  const confirmedSalesYen = sales.reduce((sum, row) => sum + confirmedShare(row), 0)
  const hakuAvailableYen = sales.reduce((sum, row) => sum + availableShare(row), 0)

  let payouts: PayoutRow[] = []
  const { data: payoutRows, error: payoutError } = await sb
    .from('performer_payouts')
    .select('id, amount_yen, status, stripe_payout_id, created_at')
    .eq('performer_id', args.performerId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (payoutError && !missingTable(payoutError) && !missingColumn(payoutError)) throw payoutError
  if (!payoutError) payouts = (payoutRows ?? []) as PayoutRow[]

  const reservedYen = payouts.filter((row) => row.status === 'reserved').reduce((sum, row) => sum + row.amount_yen, 0)
  const paidOutYen = payouts.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.amount_yen, 0)
  const pendingYen = reservedYen
  const hakuNetAvailable = Math.max(0, hakuAvailableYen - reservedYen - paidOutYen)
  const stripeAvailableYen = await jpyAvailable(stripe, args.stripeAccountId).catch(() => 0)
  const availableYen = eligiblePayoutYen(hakuNetAvailable, stripeAvailableYen)
  const openPayout = payouts.find((row) => row.status === 'reserved') ?? null

  return {
    minPayoutYen: MIN_PAYOUT_YEN,
    confirmedSalesYen,
    hakuAvailableYen: hakuNetAvailable,
    stripeAvailableYen,
    availableYen,
    pendingYen,
    paidOutYen,
    remainingYen: remainingToMinPayout(availableYen),
    canPayout: canRequestPayout(availableYen) && !openPayout && Boolean(args.stripeAccountId),
    ledgerReady: !payoutError && !salesMissing,
    openPayout,
  }
}

export async function requestPerformerPayout(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { performerId: string; stripeAccountId: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    return { status: 403, body: { error: '本番の銀行送金は無効です。' } }
  }

  const view = await getPerformerPayoutView(sb, stripe, args)
  if (!view.ledgerReady) {
    return { status: 503, body: { error: '出金台帳の準備中です。' } }
  }
  if (view.openPayout) {
    return { status: 409, body: { error: '出金を処理中です。完了するまで新しい申請はできません。', payout: view.openPayout } }
  }
  if (!canRequestPayout(view.availableYen)) {
    return {
      status: 400,
      body: {
        error: view.availableYen < MIN_PAYOUT_YEN
          ? `最低出金額は${MIN_PAYOUT_YEN.toLocaleString('ja-JP')}円です。`
          : '出金できる残高がありません。',
        remainingYen: view.remainingYen,
        availableYen: view.availableYen,
      },
    }
  }

  const amountYen = view.availableYen
  const insert = await sb
    .from('performer_payouts')
    .insert({
      performer_id: args.performerId,
      connected_account_id: args.stripeAccountId,
      amount_yen: amountYen,
      status: 'reserved',
      idempotency_key: `haku-payout:${args.performerId}:${crypto.randomUUID()}`,
      haku_available_yen: view.hakuAvailableYen,
      stripe_available_yen: view.stripeAvailableYen,
      eligible_yen: amountYen,
    })
    .select('id, amount_yen, status')
    .maybeSingle()

  if (insert.error) {
    if (insert.error.code === '23505') {
      return { status: 409, body: { error: '出金を処理中です。完了するまで新しい申請はできません。' } }
    }
    if (missingTable(insert.error)) return { status: 503, body: { error: '出金台帳の準備中です。' } }
    throw insert.error
  }
  if (!insert.data?.id) return { status: 500, body: { error: '出金申請を保存できませんでした。' } }

  const stripeIdempotencyKey = `haku-payout:${insert.data.id}`
  let payout: Stripe.Payout
  try {
    payout = await stripe.payouts.create(
      { amount: amountYen, currency: 'jpy', metadata: { performer_id: args.performerId, payout_row: insert.data.id } },
      { stripeAccount: args.stripeAccountId, idempotencyKey: stripeIdempotencyKey },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : 'Payout failed'
    await sb
      .from('performer_payouts')
      .update({ status: 'failed', failure_message: message, updated_at: new Date().toISOString() })
      .eq('id', insert.data.id)
      .eq('status', 'reserved')
    return { status: 409, body: { error: '出金を開始できませんでした。残高と受取設定を確認してください。' } }
  }

  const { error: saveError } = await sb
    .from('performer_payouts')
    .update({
      stripe_payout_id: payout.id,
      status: payout.status === 'paid' ? 'paid' : 'reserved',
      idempotency_key: stripeIdempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insert.data.id)
  if (saveError && !missingColumn(saveError)) {
    // Stripe already created the payout. Keep reserved so a retry cannot insert another row.
  }
  return { status: 200, body: { ok: true, amountYen, payoutId: insert.data.id, stripePayoutId: payout.id } }
}

export async function markPerformerPayout(
  sb: SupabaseClient,
  payout: Stripe.Payout,
  connectedAccountId: string | null,
  status: 'paid' | 'failed' | 'canceled',
) {
  const patch = {
    status,
    stripe_payout_id: payout.id,
    connected_account_id: connectedAccountId,
    failure_message: status === 'failed' ? payout.failure_message ?? payout.failure_code ?? 'payout_failed' : null,
    updated_at: new Date().toISOString(),
  }
  const byStripe = await sb.from('performer_payouts').update(patch).eq('stripe_payout_id', payout.id).select('id').maybeSingle()
  if (byStripe.error && !missingTable(byStripe.error) && !missingColumn(byStripe.error)) throw byStripe.error
  if (byStripe.data?.id || !payout.metadata?.payout_row) return
  const { error } = await sb.from('performer_payouts').update(patch).eq('id', payout.metadata.payout_row)
  if (error && !missingTable(error) && !missingColumn(error)) throw error
}
