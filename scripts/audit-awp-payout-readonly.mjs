import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabaseAuditKey = process.env.SUPABASE_AUDIT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const stripeAuditKey = process.env.STRIPE_AUDIT_KEY || process.env.STRIPE_SECRET_KEY
if (!process.env.SUPABASE_URL) throw new Error('Missing required environment variable: SUPABASE_URL')
if (!supabaseAuditKey) throw new Error('Missing SUPABASE_AUDIT_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)')
if (!stripeAuditKey) throw new Error('Missing STRIPE_AUDIT_KEY (or STRIPE_SECRET_KEY)')

const supabase = createClient(process.env.SUPABASE_URL, supabaseAuditKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const stripe = new Stripe(stripeAuditKey)
const start = '2026-10-10T00:00:00+09:00'
const end = '2026-10-13T00:00:00+09:00'
const safeDbError = (error) => String(error?.message || error?.code || 'unknown').replace(/https?:\/\/\S+/g, '[url-redacted]').slice(0, 240)

const { data: tips, error: tipError } = await supabase
  .from('tips')
  .select('id,performer_id,status,gross_amount_yen,stripe_fee_yen,haku_fee_yen,performer_share_yen,refunded_amount_yen,dispute_status,stripe_session_id,stripe_payment_intent,stripe_balance_transaction_id,stripe_checkout_mode,connected_account_id,created_at')
  .gte('created_at', start)
  .lt('created_at', end)
  .like('stripe_session_id', 'cs_live_%')
  .eq('status', 'succeeded')
if (tipError) throw new Error(`Supabase tips read failed: ${safeDbError(tipError)}`)

const performerIds = [...new Set((tips ?? []).map((row) => row.performer_id))]
const { data: performers, error: performerError } = await supabase
  .from('performers')
  .select('id,stage_name,stripe_account_id')
  .in('id', performerIds)
if (performerError) throw new Error(`Supabase performers read failed: ${safeDbError(performerError)}`)
const performerById = new Map((performers ?? []).map((row) => [row.id, row]))

const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0)
const paymentChecks = []
for (const tip of tips ?? []) {
  if (!tip.stripe_payment_intent) {
    paymentChecks.push({ performerId: tip.performer_id, ok: false, reason: 'missing_payment_intent' })
    continue
  }
  try {
    const options = tip.stripe_checkout_mode === 'platform_separate' || !tip.connected_account_id
      ? undefined
      : { stripeAccount: tip.connected_account_id }
    const intent = options
      ? await stripe.paymentIntents.retrieve(tip.stripe_payment_intent, { expand: ['latest_charge.balance_transaction'] }, options)
      : await stripe.paymentIntents.retrieve(tip.stripe_payment_intent, { expand: ['latest_charge.balance_transaction'] })
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
    const balanceTransaction = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null
    paymentChecks.push({
      performerId: tip.performer_id,
      ok: Boolean(intent.livemode && intent.status === 'succeeded' && charge?.paid),
      grossMatches: intent.amount_received === tip.gross_amount_yen,
      feeMatches: balanceTransaction ? balanceTransaction.fee === tip.stripe_fee_yen : null,
      refundedYen: charge?.amount_refunded ?? 0,
      disputed: Boolean(charge?.disputed),
      chargeId: charge?.id ?? null,
      transferGroup: charge?.transfer_group ?? null,
    })
  } catch {
    paymentChecks.push({ performerId: tip.performer_id, ok: false, reason: 'stripe_retrieve_failed' })
  }
}

const chargeIds = new Set(paymentChecks.map((row) => row.chargeId).filter(Boolean))
const transferGroups = new Set(paymentChecks.map((row) => row.transferGroup).filter(Boolean))
let matchedTransfersYen = 0
let matchedTransferCount = 0
for await (const transfer of stripe.transfers.list({ created: { gte: Math.floor(new Date(start).getTime() / 1000) }, limit: 100 })) {
  if ((transfer.source_transaction && chargeIds.has(transfer.source_transaction)) || (transfer.transfer_group && transferGroups.has(transfer.transfer_group))) {
    matchedTransferCount += 1
    matchedTransfersYen += transfer.amount
  }
}

const grouped = new Map()
for (const tip of tips ?? []) {
  const current = grouped.get(tip.performer_id) ?? []
  current.push(tip)
  grouped.set(tip.performer_id, current)
}

const byPerformer = [...grouped.entries()].map(([performerId, rows]) => ({
  performerId,
  performerName: performerById.get(performerId)?.stage_name ?? '名称未登録',
  paymentCount: rows.length,
  grossYen: sum(rows, 'gross_amount_yen'),
  stripeFeeYen: sum(rows, 'stripe_fee_yen'),
  hakuFeeYen: sum(rows, 'haku_fee_yen'),
  performerShareYen: sum(rows, 'performer_share_yen'),
  refundedYen: sum(rows, 'refunded_amount_yen'),
  openDisputeCount: rows.filter((row) => row.dispute_status && !['won', 'warning_closed'].includes(row.dispute_status)).length,
})).sort((left, right) => left.performerId.localeCompare(right.performerId))

const totals = {
  paymentCount: tips?.length ?? 0,
  grossYen: sum(tips ?? [], 'gross_amount_yen'),
  stripeFeeYen: sum(tips ?? [], 'stripe_fee_yen'),
  hakuFeeYen: sum(tips ?? [], 'haku_fee_yen'),
  performerShareYen: sum(tips ?? [], 'performer_share_yen'),
  transferCount: matchedTransferCount,
  transferredYen: matchedTransfersYen,
  stripePaymentMismatchCount: paymentChecks.filter((row) => !row.ok || row.grossMatches === false || row.feeMatches === false).length,
  refundCount: paymentChecks.filter((row) => (row.refundedYen ?? 0) > 0).length,
  disputeCount: paymentChecks.filter((row) => row.disputed).length,
}
const baseline = { paymentCount: 11, grossYen: 13100, stripeFeeYen: 521, hakuFeeYen: 1886, performerShareYen: 10693, transferCount: 0, transferredYen: 0, stripePaymentMismatchCount: 0, refundCount: 0, disputeCount: 0 }

console.log(JSON.stringify({
  mode: 'read_only',
  period: { start, end },
  baselineMatches: Object.entries(baseline).every(([key, value]) => totals[key] === value),
  totals,
  byPerformer,
}, null, 2))
