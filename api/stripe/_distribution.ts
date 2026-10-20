import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { isConnectedAccountTransferReady } from './_shared.js'
import { missingColumn, missingTable, yenFromStripe } from './_settlement.js'

type SaleKind = 'tip' | 'merch'

type Payable = {
  id: string
  performer_id: string
  connected_account_id: string | null
  stripe_charge_id: string
  amount_yen: number
  state: string
  hold_reason: string | null
  stripe_transfer_id: string | null
  transferred_yen: number
  reversed_yen: number
  idempotency_key: string
}

function stripeError(error: unknown) {
  const candidate = error as { code?: unknown; type?: unknown; message?: unknown; raw?: { code?: unknown } }
  return {
    code: String(candidate?.raw?.code ?? candidate?.code ?? candidate?.type ?? 'stripe_error').slice(0, 80),
    message: String(candidate?.message ?? 'Stripe transfer failed')
      .replace(/sk_(?:live|test)_[A-Za-z0-9_]+/g, 'sk_[redacted]')
      .slice(0, 500),
  }
}

function transferDestination(transfer: Stripe.Transfer) {
  return typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id ?? null
}

async function markRetry(sb: SupabaseClient, payable: Payable, error: unknown) {
  const safe = stripeError(error)
  const retryMinutes = Math.min(360, 2 ** Math.min(8, Math.max(1, Number((payable as Payable & { attempt_count?: number }).attempt_count) || 1)))
  const { error: updateError } = await sb.from('performer_transfer_payables').update({
    state: 'retry',
    last_error_code: safe.code,
    last_error_message: safe.message,
    next_retry_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', payable.id).eq('state', 'processing')
  if (updateError) throw updateError
}

async function finishTransfer(sb: SupabaseClient, payable: Payable, transfer: Stripe.Transfer) {
  if (
    transfer.amount !== payable.amount_yen
    || transferDestination(transfer) !== payable.connected_account_id
    || transfer.metadata?.payable_id !== payable.id
    || transfer.metadata?.sale_id !== String((payable as Payable & { sale_id?: string }).sale_id ?? '')
  ) {
    await sb.from('performer_transfer_payables').update({
      state: 'blocked', hold_reason: 'stripe_transfer_mismatch',
      last_error_code: 'transfer_mismatch', next_retry_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', payable.id)
    return false
  }
  const { error } = await sb.from('performer_transfer_payables').update({
    state: transfer.reversed ? 'reversed' : 'transferred',
    stripe_transfer_id: transfer.id,
    transferred_yen: transfer.amount,
    reversed_yen: transfer.amount_reversed ?? 0,
    transferred_at: transfer.reversed ? null : new Date().toISOString(),
    last_reconciled_at: new Date().toISOString(),
    next_retry_at: null,
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', payable.id)
  if (error) throw error
  return !transfer.reversed
}

async function reversePayable(sb: SupabaseClient, stripe: Stripe, payable: Payable) {
  if (!payable.stripe_transfer_id) return
  const transfer = await stripe.transfers.retrieve(payable.stripe_transfer_id)
  const desiredYen = payable.hold_reason?.startsWith('dispute') ? 0 : Math.max(0, payable.amount_yen)
  const alreadyReversed = yenFromStripe(transfer.amount_reversed)
  const reversalDue = Math.max(0, yenFromStripe(transfer.amount) - desiredYen - alreadyReversed)
  if (reversalDue === 0) return
  const reversal = await stripe.transfers.createReversal(
    transfer.id,
    { amount: reversalDue, metadata: { payable_id: payable.id, reason: payable.hold_reason ?? 'sale_adjustment' } },
    { idempotencyKey: `${payable.idempotency_key}:reverse:${yenFromStripe(transfer.amount) - desiredYen}` },
  )
  const totalReversed = alreadyReversed + yenFromStripe(reversal.amount)
  const { error } = await sb.from('performer_transfer_payables').update({
    state: totalReversed >= yenFromStripe(transfer.amount) ? 'reversed' : 'partially_reversed',
    stripe_transfer_reversal_id: reversal.id,
    reversed_yen: totalReversed,
    last_reconciled_at: new Date().toISOString(),
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', payable.id).eq('state', 'reversal_pending')
  if (error) throw error
}

export async function processPerformerTransfers(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { performerId: string; connectedAccountId: string },
) {
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && process.env.ENABLE_LIVE_PERFORMER_TRANSFERS !== 'true') {
    return { transferred: 0, held: true, reason: 'live_transfers_disabled' }
  }
  const { data: performer, error: performerError } = await sb.from('performers')
    .select('id,stripe_account_id').eq('id', args.performerId).maybeSingle()
  if (performerError) throw performerError
  if (!performer || performer.stripe_account_id !== args.connectedAccountId) {
    return { transferred: 0, held: true, reason: 'connected_account_mismatch' }
  }
  const account = await stripe.accounts.retrieve(args.connectedAccountId)
  if (!isConnectedAccountTransferReady(account)) {
    return { transferred: 0, held: true, reason: 'connect_not_ready' }
  }

  const { data, error } = await sb.rpc('claim_performer_transfer_payables', {
    p_performer_id: args.performerId,
    p_connected_account_id: args.connectedAccountId,
    p_limit: 20,
  })
  if (error) {
    if (missingTable(error) || missingColumn(error)) return { transferred: 0, held: true, reason: 'ledger_not_ready' }
    throw error
  }

  let transferred = 0
  for (const payable of (data ?? []) as Payable[]) {
    try {
      let transfer: Stripe.Transfer
      if (payable.stripe_transfer_id) {
        transfer = await stripe.transfers.retrieve(payable.stripe_transfer_id)
      } else {
        transfer = await stripe.transfers.create({
          amount: payable.amount_yen,
          currency: 'jpy',
          destination: args.connectedAccountId,
          source_transaction: payable.stripe_charge_id,
          transfer_group: `haku-sale:${payable.id}`,
          metadata: {
            performer_id: args.performerId,
            payable_id: payable.id,
            sale_id: String((payable as Payable & { sale_id?: string }).sale_id ?? ''),
          },
        }, { idempotencyKey: payable.idempotency_key })
      }
      if (await finishTransfer(sb, payable, transfer)) transferred += 1
    } catch (error) {
      await markRetry(sb, payable, error)
    }
  }
  return { transferred, held: false }
}

export async function syncAutomaticTransferForSale(
  sb: SupabaseClient,
  stripe: Stripe,
  args: { kind: SaleKind; saleId: string },
) {
  const table = args.kind === 'tip' ? 'tips' : 'merch_orders'
  const ownerColumn = args.kind === 'tip' ? 'performer_id' : 'seller_id'
  const { data: saleData, error } = await sb.from(table).select([
    'id', ownerColumn, 'stripe_charge_id', 'stripe_balance_transaction_id',
    'performer_share_yen', 'settlement_status', 'stripe_checkout_mode',
    'automatic_transfer_eligible_at', 'status', 'dispute_status', 'refunded_amount_yen',
  ].join(',')).eq('id', args.saleId).maybeSingle()
  if (error) {
    if (missingColumn(error) || missingTable(error)) return { synced: false, reason: 'ledger_not_ready' }
    throw error
  }
  const sale = saleData as unknown as Record<string, unknown> | null
  if (!sale?.automatic_transfer_eligible_at) return { synced: false, reason: 'historical_excluded' }
  if (sale.stripe_checkout_mode !== 'platform_separate' || sale.settlement_status !== 'settled' || !sale.stripe_charge_id) {
    return { synced: false, reason: 'not_settled_platform_sale' }
  }
  const performerId = String(sale[ownerColumn])
  const refunded = yenFromStripe(sale.refunded_amount_yen as number | null | undefined)
  const disputeOpen = sale.dispute_status && !['won', 'warning_closed'].includes(String(sale.dispute_status))
  const holdReason = disputeOpen ? `dispute:${String(sale.dispute_status)}`
    : sale.status === 'refunded' || refunded > 0 ? 'refund_adjustment'
      : null
  const { data: payableData, error: syncError } = await sb.rpc('sync_performer_transfer_payable', {
    p_sale_kind: args.kind,
    p_sale_id: args.saleId,
    p_performer_id: performerId,
    p_stripe_charge_id: sale.stripe_charge_id,
    p_stripe_balance_transaction_id: sale.stripe_balance_transaction_id,
    p_amount_yen: Math.max(0, yenFromStripe(sale.performer_share_yen as number | null | undefined)),
    p_hold_reason: holdReason,
  }).maybeSingle()
  if (syncError) throw syncError
  const payable = payableData as Payable | null
  if (!payable) return { synced: false, reason: 'payable_not_created' }
  if (payable.state === 'reversal_pending') {
    try {
      await reversePayable(sb, stripe, payable as Payable)
    } catch (reversalError) {
      const safe = stripeError(reversalError)
      await sb.from('performer_transfer_payables').update({
        last_error_code: safe.code, last_error_message: safe.message,
        next_retry_at: new Date(Date.now() + 15 * 60_000).toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', payable.id).eq('state', 'reversal_pending')
    }
    return { synced: true, state: 'reversal_pending' }
  }
  if (!payable.connected_account_id || holdReason) return { synced: true, state: payable.state }
  return processPerformerTransfers(sb, stripe, {
    performerId,
    connectedAccountId: payable.connected_account_id,
  })
}

export async function retryAutomaticTransfers(sb: SupabaseClient, stripe: Stripe) {
  const { data, error } = await sb.from('performer_transfer_payables')
    .select('id,sale_kind,sale_id,performer_id,connected_account_id,state')
    .in('state', ['ready', 'retry', 'processing', 'reversal_pending'])
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    if (missingTable(error) || missingColumn(error)) return { processed: 0, reason: 'ledger_not_ready' }
    throw error
  }
  let processed = 0
  const performers = new Map<string, string>()
  for (const row of (data ?? []) as Array<{
    id: string; sale_kind: SaleKind; sale_id: string; performer_id: string;
    connected_account_id: string | null; state: string
  }>) {
    if (row.state === 'reversal_pending') {
      await syncAutomaticTransferForSale(sb, stripe, { kind: row.sale_kind as SaleKind, saleId: row.sale_id })
      processed += 1
    } else if (row.connected_account_id) {
      performers.set(row.performer_id, row.connected_account_id)
    }
  }
  for (const [performerId, connectedAccountId] of performers) {
    const result = await processPerformerTransfers(sb, stripe, { performerId, connectedAccountId })
    processed += result.transferred
  }
  return { processed }
}

