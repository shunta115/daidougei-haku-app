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
  stripe_fee_yen?: number | null
  haku_fee_bps?: number | null
  refunded_amount_yen?: number | null
  dispute_status?: string | null
  settlement_status?: string | null
}

type PayoutRow = {
  id: string
  amount_yen: number
  status: string
  stripe_payout_id: string | null
  stripe_transfer_id?: string | null
  created_at: string
}

function saleGross(row: SaleRow): number {
  return yenFromStripe(row.gross_amount_yen ?? row.amount_cents ?? row.amount_yen)
}

function confirmedShare(row: SaleRow): number {
  if (row.settlement_status !== 'settled') return 0
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
    stripeFeeYen: yenFromStripe(row.stripe_fee_yen),
    feeBps: yenFromStripe(row.haku_fee_bps),
    status: row.status,
    disputeStatus: row.dispute_status,
  })
}

function adjustedConfirmedShare(row: SaleRow): number {
  const share = confirmedShare(row)
  if (share <= 0) return 0
  return remainingShareYen({
    performerShareYen: share,
    grossYen: saleGross(row),
    refundedYen: yenFromStripe(row.refunded_amount_yen),
    stripeFeeYen: yenFromStripe(row.stripe_fee_yen),
    feeBps: yenFromStripe(row.haku_fee_bps),
    status: row.status,
  })
}

async function jpyAvailable(stripe: Stripe): Promise<number> {
  const balance = await stripe.balance.retrieve()
  return yenFromStripe(balance.available.find((item) => item.currency === 'jpy')?.amount)
}

export async function getPerformerPayoutView(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { performerId: string; stripeAccountId: string | null },
) {
  const [{ data: tips, error: tipError }, { data: orders, error: orderError }] = await Promise.all([
    sb.from('tips').select('id, status, gross_amount_yen, amount_cents, performer_share_yen, refunded_amount_yen, dispute_status, settlement_status').eq('performer_id', args.performerId),
    sb.from('merch_orders').select('id, status, gross_amount_yen, amount_yen, performer_share_yen, refunded_amount_yen, dispute_status, settlement_status').eq('seller_id', args.performerId),
  ])
  const salesMissing = Boolean((tipError && missingColumn(tipError)) || (orderError && missingColumn(orderError)))
  if (tipError && !missingColumn(tipError)) throw tipError
  if (orderError && !missingColumn(orderError)) throw orderError

  const sales = salesMissing ? [] : [...((tips ?? []) as SaleRow[]), ...((orders ?? []) as SaleRow[])]
  const confirmedSalesYen = sales.reduce((sum, row) => sum + adjustedConfirmedShare(row), 0)
  const hakuAvailableYen = sales.reduce((sum, row) => sum + availableShare(row), 0)
  const heldYen = Math.max(0, confirmedSalesYen - hakuAvailableYen)

  let payouts: PayoutRow[] = []
  const { data: payoutRows, error: payoutError } = await sb
    .from('performer_payouts')
    .select('id, amount_yen, status, stripe_payout_id, stripe_transfer_id, created_at')
    .eq('performer_id', args.performerId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (payoutError && !missingTable(payoutError) && !missingColumn(payoutError)) throw payoutError
  if (!payoutError) payouts = (payoutRows ?? []) as PayoutRow[]

  const reservedYen = payouts.filter((row) => row.status === 'reserved').reduce((sum, row) => sum + row.amount_yen, 0)
  const paidOutYen = payouts.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.amount_yen, 0)
  const pendingYen = reservedYen
  const hakuNetAvailable = Math.max(0, hakuAvailableYen - reservedYen - paidOutYen)
  // New sales remain on the platform until the internal payable balance reaches
  // the threshold, so the relevant Stripe constraint is the platform balance.
  const stripeAvailableYen = await jpyAvailable(stripe).catch(() => 0)
  const availableYen = eligiblePayoutYen(hakuNetAvailable, stripeAvailableYen)
  const openPayout = payouts.find((row) => row.status === 'reserved') ?? null

  return {
    minPayoutYen: MIN_PAYOUT_YEN,
    confirmedSalesYen,
    hakuAvailableYen: hakuNetAvailable,
    stripeAvailableYen,
    availableYen,
    heldYen,
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
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && process.env.ENABLE_LIVE_PERFORMER_TRANSFERS !== 'true') {
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
      funding_model: 'platform_separate',
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
  let transfer: Stripe.Transfer
  try {
    transfer = await stripe.transfers.create(
      {
        amount: amountYen,
        currency: 'jpy',
        destination: args.stripeAccountId,
        transfer_group: `haku-payout:${insert.data.id}`,
        metadata: { performer_id: args.performerId, payout_row: insert.data.id },
      },
      { idempotencyKey: stripeIdempotencyKey },
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
      stripe_transfer_id: transfer.id,
      status: 'paid',
      idempotency_key: stripeIdempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insert.data.id)
  if (saveError && !missingColumn(saveError)) {
    // Stripe already created the transfer. Keep reserved so a retry cannot insert another row.
  }
  return { status: 200, body: { ok: true, amountYen, payoutId: insert.data.id, stripeTransferId: transfer.id } }
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

export async function markPerformerTransfer(sb: SupabaseClient, transfer: Stripe.Transfer) {
  const payoutRow = transfer.metadata?.payout_row
  if (!payoutRow) return
  const { error } = await sb
    .from('performer_payouts')
    .update({
      stripe_transfer_id: transfer.id,
      status: transfer.reversed ? 'canceled' : 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('id', payoutRow)
    .eq('funding_model', 'platform_separate')
  if (error && !missingTable(error) && !missingColumn(error)) throw error
}
