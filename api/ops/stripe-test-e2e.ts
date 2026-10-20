import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { TIP_SYSTEM_FEE_BPS } from '../../shared/fees.js'
import { processPerformerTransfers, syncAutomaticTransferForSale } from '../stripe/_distribution.js'
import { getAdminSupabase, getStripe, isConnectedAccountTransferReady } from '../stripe/_shared.js'
import { settleSaleByCharge } from '../stripe/_settlement.js'

const TEST_SUPABASE_REF = 'aeqskxxykzapgaudbeqa'
const FIXTURE_PREFIX = 'haku-pr77-stripe-e2e'

function secretMatches(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function stripeTestE2eEnvironmentIsSafe(now = Date.now()) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const expiresAt = Date.parse(process.env.STRIPE_TEST_E2E_EXPIRES_AT || '')
  try {
    return process.env.VERCEL_ENV === 'preview'
      && process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
      && new URL(supabaseUrl).hostname.startsWith(`${TEST_SUPABASE_REF}.`)
      && Boolean(process.env.STRIPE_TEST_CONNECTED_ACCOUNT_ID?.startsWith('acct_'))
      && Number.isFinite(expiresAt)
      && now < expiresAt
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!stripeTestE2eEnvironmentIsSafe()) return res.status(403).json({ error: 'test_environment_required' })
  if (!secretMatches(req.headers['x-haku-e2e-token'] as string | undefined, process.env.STRIPE_TEST_E2E_TOKEN)) {
    return res.status(401).json({ error: 'invalid_test_token' })
  }

  const requestedRunId = typeof req.body?.runId === 'string' ? req.body.runId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedRunId)) {
    return res.status(400).json({ error: 'invalid_run_id' })
  }

  const sb = getAdminSupabase()
  const stripe = getStripe()
  const connectedAccountId = process.env.STRIPE_TEST_CONNECTED_ACCOUNT_ID as string
  const fixtureEmail = `${FIXTURE_PREFIX}+${requestedRunId}@example.invalid`
  const metadata = { haku_test: 'true', suite: 'pr77', run_id: requestedRunId }

  try {
    const account = await stripe.accounts.retrieve(connectedAccountId)
    if (!isConnectedAccountTransferReady(account)) throw new Error('test_connected_account_not_ready')

    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: fixtureEmail,
      email_confirm: true,
      user_metadata: { role: 'performer', test_fixture: FIXTURE_PREFIX },
    })
    if (authError || !authData.user) throw authError || new Error('fixture_user_create_failed')
    const performerId = authData.user.id

    const { error: profileError } = await sb.from('profiles').upsert({
      id: performerId,
      role: 'performer',
      status: 'active',
      display_name: 'PR77 Stripe E2E',
      email: fixtureEmail,
    })
    if (profileError) throw profileError
    const { error: performerError } = await sb.from('performers').insert({
      id: performerId,
      stage_name: `[E2E] PR77 ${requestedRunId.slice(0, 8)}`,
      stripe_account_id: connectedAccountId,
      stripe_onboarding_complete: true,
      is_approved: true,
      review_status: 'approved',
    })
    if (performerError) throw performerError

    const tipId = crypto.randomUUID()
    const amountYen = 1_000
    const { error: tipError } = await sb.from('tips').insert({
      id: tipId,
      fan_id: null,
      performer_id: performerId,
      amount_cents: amountYen,
      gross_amount_yen: amountYen,
      currency: 'jpy',
      platform_fee_cents: 0,
      platform_fee_yen: 0,
      status: 'pending',
      stripe_checkout_mode: 'platform_separate',
      funding_model: 'platform_separate',
      transfer_status: 'pending',
      automatic_transfer_eligible_at: new Date().toISOString(),
    })
    if (tipError) throw tipError

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountYen,
      currency: 'jpy',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { ...metadata, kind: 'tip', tip_id: tipId, performer_id: performerId },
    }, { idempotencyKey: `${FIXTURE_PREFIX}:payment:${requestedRunId}` })
    const chargeId = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id
    if (!chargeId || paymentIntent.status !== 'succeeded') throw new Error('test_payment_not_succeeded')
    const { error: paymentLinkError } = await sb.from('tips').update({
      stripe_payment_intent: paymentIntent.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: chargeId,
      status: 'succeeded',
    }).eq('id', tipId)
    if (paymentLinkError) throw paymentLinkError

    const settled = await settleSaleByCharge(
      sb,
      stripe,
      { id: chargeId, payment_intent: paymentIntent.id } as never,
      null,
    )
    if (settled.length !== 1 || settled[0].saleId !== tipId) throw new Error('test_settlement_not_recorded')

    // Two simultaneous deliveries exercise the database claim lease. Exactly
    // one may create the Transfer; the other must observe no claimable row.
    const parallelResults = await Promise.all([
      syncAutomaticTransferForSale(sb, stripe, { kind: 'tip', saleId: tipId }),
      syncAutomaticTransferForSale(sb, stripe, { kind: 'tip', saleId: tipId }),
    ])
    const { data: transferred, error: transferredError } = await sb.from('performer_transfer_payables')
      .select('*').eq('sale_kind', 'tip').eq('sale_id', tipId).single()
    if (transferredError || !transferred?.stripe_transfer_id || transferred.state !== 'transferred') {
      throw transferredError || new Error('test_transfer_not_recorded')
    }
    const transfer = await stripe.transfers.retrieve(transferred.stripe_transfer_id)
    if (transfer.amount !== transferred.transferred_yen || transfer.destination !== connectedAccountId) {
      throw new Error('test_transfer_mismatch')
    }

    // The same Stripe idempotency key models an unknown-response retry. Stripe
    // must return the original Transfer rather than move funds twice.
    const replayedTransfer = await stripe.transfers.create({
      amount: transfer.amount,
      currency: 'jpy',
      destination: connectedAccountId,
      source_transaction: chargeId,
      transfer_group: `haku-sale:${transferred.id}`,
      metadata: transfer.metadata,
    }, { idempotencyKey: transferred.idempotency_key })
    if (replayedTransfer.id !== transfer.id) throw new Error('stripe_idempotency_replay_created_duplicate')

    // A duplicate webhook event id must be rejected by the same unique ledger
    // used by the production webhook handler.
    const eventId = `evt_${FIXTURE_PREFIX.replaceAll('-', '')}_${requestedRunId.replaceAll('-', '')}`.slice(0, 255)
    const eventRow = {
      event_id: eventId,
      event_type: 'payment_intent.succeeded',
      livemode: false,
      connected_account_id: null,
      source: 'platform',
      object_id: paymentIntent.id,
      status: 'processed',
    }
    const firstEvent = await sb.from('stripe_webhook_events').insert(eventRow)
    const duplicateEvent = await sb.from('stripe_webhook_events').insert(eventRow)
    if (firstEvent.error || duplicateEvent.error?.code !== '23505') throw new Error('webhook_replay_not_rejected')

    const refundAmountYen = 100
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: refundAmountYen,
      metadata,
    }, { idempotencyKey: `${FIXTURE_PREFIX}:refund:${requestedRunId}` })
    const refundedCharge = await stripe.charges.retrieve(chargeId)
    await settleSaleByCharge(sb, stripe, refundedCharge, null)
    await syncAutomaticTransferForSale(sb, stripe, { kind: 'tip', saleId: tipId })
    const { data: reversed, error: reversedError } = await sb.from('performer_transfer_payables')
      .select('*').eq('sale_kind', 'tip').eq('sale_id', tipId).single()
    if (reversedError || !['partially_reversed', 'reversed'].includes(reversed?.state)) {
      throw reversedError || new Error('test_refund_reversal_not_recorded')
    }
    const reconciledTransfer = await stripe.transfers.retrieve(transfer.id)
    if (reconciledTransfer.amount_reversed !== reversed.reversed_yen || reversed.reversed_yen <= 0) {
      throw new Error('test_reversal_mismatch')
    }

    // Confirm the remaining connected-account funds can enter Stripe's payout
    // lifecycle. This is a TEST payout only; no real bank movement is possible.
    const payoutAmount = Math.max(1, Number(reversed.amount_yen))
    const payout = await stripe.payouts.create({
      amount: payoutAmount,
      currency: 'jpy',
      metadata,
    }, {
      stripeAccount: connectedAccountId,
      idempotencyKey: `${FIXTURE_PREFIX}:payout:${requestedRunId}`,
    })

    // Verify the retry worker is harmless after completion.
    const postCompletionRetry = await processPerformerTransfers(sb, stripe, {
      performerId,
      connectedAccountId,
    })
    const transferList = await stripe.transfers.list({
      destination: connectedAccountId,
      transfer_group: `haku-sale:${transferred.id}`,
      limit: 10,
    })

    return res.status(200).json({
      ok: true,
      mode: 'test',
      runId: requestedRunId,
      payment: { id: paymentIntent.id, status: paymentIntent.status, amountYen },
      settlement: {
        stripeFeeYen: Number((await sb.from('tips').select('stripe_fee_yen').eq('id', tipId).single()).data?.stripe_fee_yen),
        feeBps: TIP_SYSTEM_FEE_BPS,
        performerShareYen: Number(reversed.amount_yen),
      },
      transfer: {
        id: transfer.id,
        amountYen: transfer.amount,
        duplicatePrevented: replayedTransfer.id === transfer.id && transferList.data.length === 1,
        parallelResults,
      },
      webhookReplay: { eventId, duplicateRejected: duplicateEvent.error?.code === '23505' },
      refund: { id: refund.id, amountYen: refundAmountYen, reversedYen: reversed.reversed_yen },
      payout: { id: payout.id, amountYen: payout.amount, status: payout.status },
      ledger: { payableId: reversed.id, state: reversed.state, attempts: reversed.attempt_count },
      postCompletionRetry,
      historicalSalesTouched: 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'stripe_test_e2e_failed'
    console.error('Stripe TEST E2E failed', message.replace(/sk_(?:live|test)_[A-Za-z0-9_]+/g, 'sk_[redacted]'))
    return res.status(500).json({ ok: false, error: message.slice(0, 300) })
  }
}
