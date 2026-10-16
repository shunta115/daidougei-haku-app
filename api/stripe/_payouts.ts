import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { MIN_PAYOUT_YEN, canRequestPayout, eligiblePayoutYen, remainingShareYen, remainingToMinPayout } from '../../shared/payoutMath.js'
import { missingColumn, missingTable, yenFromStripe } from './_settlement.js'

type SaleRow = {
  id: string
  created_at?: string | null
  status: string
  gross_amount_yen?: number | null
  amount_cents?: number | null
  amount_yen?: number | null
  performer_share_yen?: number | null
  stripe_fee_yen?: number | null
  haku_fee_yen?: number | null
  haku_fee_bps?: number | null
  refunded_amount_yen?: number | null
  dispute_status?: string | null
  settlement_status?: string | null
  stripe_session_id?: string | null
  stripe_balance_transaction_id?: string | null
  stripe_checkout_mode?: string | null
  connected_account_id?: string | null
}

type PayoutRow = {
  id: string
  amount_yen: number
  status: string
  stripe_payout_id: string | null
  stripe_transfer_id?: string | null
  connected_account_id?: string | null
  idempotency_key?: string | null
  transfer_status?: string | null
  bank_payout_status?: string | null
  created_at: string
}

function saleGross(row: SaleRow): number {
  return yenFromStripe(row.gross_amount_yen ?? row.amount_cents ?? row.amount_yen)
}

function confirmedShare(row: SaleRow): number {
  // Production payouts fail closed: test and unclassified legacy rows remain in
  // history but never enter the withdrawable ledger.
  if (!row.stripe_session_id?.startsWith('cs_live_')) return 0
  if (row.settlement_status !== 'settled') return 0
  if (row.status === 'pending' || row.status === 'failed' || row.status === 'expired') return 0
  const share = row.performer_share_yen
  if (Number.isInteger(share) && (share ?? 0) >= 0) return share ?? 0
  return 0
}

function grossForMode(row: SaleRow, prefix: 'cs_live_' | 'cs_test_'): number {
  return row.stripe_session_id?.startsWith(prefix) && (row.status === 'succeeded' || row.status === 'refunded')
    ? saleGross(row)
    : 0
}

function availableShare(row: SaleRow): number {
  // Direct-charge funds already belong to the connected account and must never
  // be paid again from the platform. Only platform-held separate charges enter
  // HAKU's Transfer ledger.
  if (row.stripe_checkout_mode !== 'platform_separate') return 0
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
    disputeStatus: row.dispute_status,
  })
}

const HOLDING_REVIEW_DAYS = 30

function ageInDays(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
}

async function jpyAvailable(stripe: Stripe): Promise<number> {
  const balance = await stripe.balance.retrieve()
  return yenFromStripe(balance.available.find((item) => item.currency === 'jpy')?.amount)
}

async function isSaleFunded(stripe: Stripe, row: SaleRow): Promise<boolean> {
  if (!row.stripe_balance_transaction_id) return false
  try {
    const connected = row.stripe_checkout_mode === 'platform_separate' ? null : row.connected_account_id
    const transaction = connected
      ? await stripe.balanceTransactions.retrieve(row.stripe_balance_transaction_id, {}, { stripeAccount: connected })
      : await stripe.balanceTransactions.retrieve(row.stripe_balance_transaction_id)
    return transaction.status === 'available' || transaction.available_on * 1000 <= Date.now()
  } catch {
    return false
  }
}

export async function getPerformerPayoutView(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { performerId: string; stripeAccountId: string | null },
) {
  const [{ data: tips, error: tipError }, { data: orders, error: orderError }] = await Promise.all([
    sb.from('tips').select('id, created_at, status, gross_amount_yen, amount_cents, performer_share_yen, stripe_fee_yen, haku_fee_bps, haku_fee_yen, refunded_amount_yen, dispute_status, settlement_status, stripe_session_id, stripe_balance_transaction_id, stripe_checkout_mode, connected_account_id').eq('performer_id', args.performerId),
    sb.from('merch_orders').select('id, created_at, status, gross_amount_yen, amount_yen, performer_share_yen, stripe_fee_yen, haku_fee_bps, haku_fee_yen, refunded_amount_yen, dispute_status, settlement_status, stripe_session_id, stripe_balance_transaction_id, stripe_checkout_mode, connected_account_id').eq('seller_id', args.performerId),
  ])
  const salesMissing = Boolean((tipError && missingColumn(tipError)) || (orderError && missingColumn(orderError)))
  if (tipError && !missingColumn(tipError)) throw tipError
  if (orderError && !missingColumn(orderError)) throw orderError

  const sales = salesMissing ? [] : [...((tips ?? []) as SaleRow[]), ...((orders ?? []) as SaleRow[])]
  const originalConfirmedSalesYen = sales.reduce((sum, row) => sum + confirmedShare(row), 0)
  const confirmedSalesYen = sales.reduce((sum, row) => sum + adjustedConfirmedShare(row), 0)
  const platformSales = sales.filter((row) => row.stripe_checkout_mode === 'platform_separate')
  const platformOriginalShareYen = platformSales.reduce((sum, row) => sum + confirmedShare(row), 0)
  const platformAdjustedShareYen = platformSales.reduce((sum, row) => sum + adjustedConfirmedShare(row), 0)
  const hakuAvailableYen = sales.reduce((sum, row) => sum + availableShare(row), 0)
  // Direct charges already belong to the connected account. They remain part
  // of lifetime sales/share totals, but are never classified as HAKU-held or
  // as a refund/dispute adjustment in the platform Transfer ledger.
  const heldYen = Math.max(0, platformAdjustedShareYen - hakuAvailableYen)
  const adjustmentYen = Math.max(0, platformOriginalShareYen - platformAdjustedShareYen)
  const productionGrossYen = sales.reduce((sum, row) => sum + grossForMode(row, 'cs_live_'), 0)
  const testGrossYen = sales.reduce((sum, row) => sum + grossForMode(row, 'cs_test_'), 0)
  const stripeFeeYen = sales.reduce((sum, row) => sum + (confirmedShare(row) > 0 ? yenFromStripe(row.stripe_fee_yen) : 0), 0)
  const hakuFeeYen = sales.reduce((sum, row) => sum + (confirmedShare(row) > 0 ? yenFromStripe(row.haku_fee_yen) : 0), 0)
  const funded = await Promise.all(sales.map(async (row) => ({ row, funded: await isSaleFunded(stripe, row) })))
  const fundedShareYen = funded.reduce((sum, item) => sum + (item.funded ? availableShare(item.row) : 0), 0)

  let payouts: PayoutRow[] = []
  const { data: payoutRows, error: payoutError } = await sb
    .from('performer_payouts')
    .select('id, amount_yen, status, stripe_payout_id, stripe_transfer_id, connected_account_id, idempotency_key, transfer_status, bank_payout_status, created_at')
    .eq('performer_id', args.performerId)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (payoutError && !missingTable(payoutError) && !missingColumn(payoutError)) throw payoutError
  if (!payoutError) payouts = (payoutRows ?? []) as PayoutRow[]

  const reservedYen = payouts.filter((row) => row.status === 'reserved' && !row.stripe_transfer_id).reduce((sum, row) => sum + row.amount_yen, 0)
  const processingYen = payouts.filter((row) => row.status === 'reserved' && row.stripe_transfer_id).reduce((sum, row) => sum + row.amount_yen, 0)
  const paidOutYen = payouts.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.amount_yen, 0)
  const failedYen = payouts.filter((row) => row.status === 'failed').reduce((sum, row) => sum + row.amount_yen, 0)
  const canceledYen = payouts.filter((row) => row.status === 'canceled').reduce((sum, row) => sum + row.amount_yen, 0)
  const pendingYen = reservedYen + processingYen
  const hakuNetAvailable = Math.max(0, hakuAvailableYen - pendingYen - paidOutYen)
  const fundedUnallocatedYen = Math.max(0, fundedShareYen - pendingYen - paidOutYen)
  const fundsPendingYen = Math.max(0, hakuNetAvailable - fundedUnallocatedYen)
  // New sales remain on the platform until the internal payable balance reaches
  // the threshold, so the relevant Stripe constraint is the platform balance.
  const stripeAvailableYen = await jpyAvailable(stripe).catch(() => 0)
  const availableYen = eligiblePayoutYen(fundedUnallocatedYen, stripeAvailableYen)
  const openPayout = payouts.find((row) => row.status === 'reserved') ?? null
  const canReconcile = openPayout?.transfer_status === 'needs_reconciliation'
  let previouslyAllocatedYen = pendingYen + paidOutYen
  const unpaidSales = sales
    .filter((row) => availableShare(row) > 0 && row.created_at)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
    .filter((row) => {
      const share = availableShare(row)
      if (previouslyAllocatedYen >= share) {
        previouslyAllocatedYen -= share
        return false
      }
      previouslyAllocatedYen = 0
      return true
    })
  const oldestEligibleSaleAt = unpaidSales[0]?.created_at ? String(unpaidSales[0].created_at) : null
  const holdingAgeDays = hakuNetAvailable > 0 ? ageInDays(oldestEligibleSaleAt) : null

  let connectReady = false
  if (args.stripeAccountId) {
    try {
      const account = await stripe.accounts.retrieve(args.stripeAccountId)
      connectReady = account.details_submitted && account.payouts_enabled && account.capabilities?.transfers === 'active'
        && !account.requirements?.disabled_reason && !(account.requirements?.currently_due?.length) && !(account.requirements?.past_due?.length)
    } catch { connectReady = false }
  }
  const thresholdMet = canRequestPayout(availableYen)
  const payoutBlockReason = canReconcile ? '送金状態の再照合が必要です。新しい出金申請は停止されています。'
    : openPayout ? '出金申請を処理中です。'
    : !args.stripeAccountId ? 'Stripeの受取設定が未登録です。'
      : !connectReady ? 'Stripeの本人確認・銀行口座・送金設定を完了してください。'
        : !thresholdMet ? `確定済みの出金申請可能額が最低出金額${MIN_PAYOUT_YEN.toLocaleString('ja-JP')}円に達していません。`
          : null
  return {
    minPayoutYen: MIN_PAYOUT_YEN,
    productionGrossYen,
    performerShareYen: confirmedSalesYen,
    testGrossYen,
    stripeFeeYen,
    hakuFeeYen,
    confirmedSalesYen,
    hakuAvailableYen: hakuNetAvailable,
    stripeAvailableYen,
    platformTransferCapacityYen: stripeAvailableYen,
    fundedUnallocatedYen,
    fundsPendingYen,
    availableYen,
    heldYen,
    adjustmentYen,
    reservedYen,
    processingYen,
    pendingYen,
    paidOutYen,
    failedYen,
    canceledYen,
    oldestEligibleSaleAt,
    holdingAgeDays,
    holdingReviewDays: HOLDING_REVIEW_DAYS,
    holdingReviewRequired: holdingAgeDays !== null && holdingAgeDays >= HOLDING_REVIEW_DAYS,
    remainingYen: remainingToMinPayout(availableYen),
    connectReady,
    thresholdMet,
    payoutBlockReason,
    canPayout: thresholdMet && !openPayout && connectReady,
    canReconcile,
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
  const executeTransfer = async (row: PayoutRow) => {
    if (row.connected_account_id && row.connected_account_id !== args.stripeAccountId) {
      return { status: 409, body: { error: '受取先が変更されています。運営による照合が必要です。' } }
    }
    const key = row.idempotency_key || `haku-payout:${row.id}`
    const finishTransfer = async (transfer: Stripe.Transfer) => {
      const destination = typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id
      if (transfer.amount !== row.amount_yen || destination !== args.stripeAccountId || transfer.metadata?.payout_row !== row.id) {
        await sb.from('performer_payouts').update({
          transfer_status: 'needs_reconciliation', failure_message: 'Stripe Transfer does not match the reserved payout',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id).eq('status', 'reserved')
        return { status: 409, body: { error: '送金情報が予約内容と一致しません。運営による照合が必要です。' } }
      }
      const reversed = Boolean(transfer.reversed)
      const { error } = await sb.from('performer_payouts').update({
        stripe_transfer_id: transfer.id,
        status: reversed ? 'canceled' : 'paid',
        transfer_status: reversed ? 'reversed' : 'succeeded',
        transfer_completed_at: reversed ? null : new Date().toISOString(),
        idempotency_key: key, failure_message: null, updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'reserved')
      if (error && !missingColumn(error)) throw error
      return reversed
        ? { status: 409, body: { error: '送金はStripeで取り消されています。残高の再計算が必要です。' } }
        : { status: 200, body: { ok: true, amountYen: row.amount_yen, payoutId: row.id, stripeTransferId: transfer.id } }
    }
    try {
      if (row.stripe_transfer_id) {
        const existing = await stripe.transfers.retrieve(row.stripe_transfer_id)
        return await finishTransfer(existing)
      }
      const transfer = await stripe.transfers.create({
        amount: row.amount_yen, currency: 'jpy', destination: args.stripeAccountId,
        transfer_group: `haku-payout:${row.id}`,
        metadata: { performer_id: args.performerId, payout_row: row.id },
      }, { idempotencyKey: key })
      return await finishTransfer(transfer)
    } catch (error) {
      // Keep the reservation locked. A network error can occur after Stripe
      // created the Transfer; retrying with the same key safely reconciles it.
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Transfer status unknown'
      await sb.from('performer_payouts').update({ transfer_status: 'needs_reconciliation', failure_message: message, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'reserved')
      return { status: 409, body: { error: '送金状態を確認中です。二重送金防止のため予約を保持しています。' } }
    }
  }
  if (view.openPayout) return executeTransfer(view.openPayout as PayoutRow)
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
  const idempotencyKey = `haku-payout:${args.performerId}:${crypto.randomUUID()}`
  const insert = await sb.rpc('reserve_performer_payout', {
    p_performer_id: args.performerId, p_connected_account_id: args.stripeAccountId,
    p_amount_yen: amountYen, p_idempotency_key: idempotencyKey,
    p_stripe_available_yen: view.stripeAvailableYen,
  }).maybeSingle()

  if (insert.error) {
    if (insert.error.code === '23505') {
      return { status: 409, body: { error: '出金を処理中です。完了するまで新しい申請はできません。' } }
    }
    if (missingTable(insert.error)) return { status: 503, body: { error: '出金台帳の準備中です。' } }
    throw insert.error
  }
  if (!insert.data?.id) return { status: 500, body: { error: '出金申請を保存できませんでした。' } }

  return executeTransfer({ ...insert.data, amount_yen: amountYen, connected_account_id: args.stripeAccountId, idempotency_key: idempotencyKey, stripe_payout_id: null, created_at: new Date().toISOString() } as PayoutRow)
}

export async function markPerformerPayout(
  sb: SupabaseClient,
  payout: Stripe.Payout,
  connectedAccountId: string | null,
  status: 'paid' | 'failed' | 'canceled',
) {
  // A connected-account bank Payout may contain funds from several Transfers.
  // Preserve it as an independent observation instead of treating it as proof
  // that one internal Transfer/allocation row reached the performer's bank.
  if (connectedAccountId) {
    const { data: performer, error: performerError } = await sb
      .from('performers')
      .select('id')
      .eq('stripe_account_id', connectedAccountId)
      .maybeSingle()
    if (performerError) throw performerError

    const arrivalDate = Number.isInteger(payout.arrival_date)
      ? new Date(payout.arrival_date * 1000).toISOString()
      : null
    const { error: ledgerError } = await sb.from('connected_account_payouts').upsert({
      connected_account_id: connectedAccountId,
      performer_id: performer?.id ?? null,
      stripe_payout_id: payout.id,
      amount_yen: yenFromStripe(payout.amount),
      currency: payout.currency,
      status,
      arrival_date: arrivalDate,
      failure_code: status === 'failed' ? payout.failure_code ?? null : null,
      failure_message: status === 'failed' ? payout.failure_message ?? null : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'connected_account_id,stripe_payout_id' })
    if (ledgerError) throw ledgerError
  }

  const patch = {
    bank_payout_status: status,
    stripe_payout_id: payout.id,
    connected_account_id: connectedAccountId,
    failure_message: status === 'failed' ? payout.failure_message ?? payout.failure_code ?? 'payout_failed' : null,
    updated_at: new Date().toISOString(),
  }
  // Only update a legacy allocation row when Stripe carries an explicit row
  // reference. Never infer a 1:1 relationship from account or amount.
  if (!payout.metadata?.payout_row) return
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
      transfer_status: transfer.reversed ? 'reversed' : 'succeeded',
      transfer_completed_at: transfer.reversed ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payoutRow)
    .eq('funding_model', 'platform_separate')
  if (error && !missingTable(error) && !missingColumn(error)) throw error
}
