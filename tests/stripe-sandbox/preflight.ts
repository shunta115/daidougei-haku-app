import type Stripe from 'stripe'

/** Read-only gate: fail before entering a test card if the Sandbox cannot settle. */
export async function verifySettlementPermissions(stripe: Stripe) {
  const [sessions, balances] = await Promise.all([
    stripe.checkout.sessions.list({ limit: 1 }),
    stripe.balanceTransactions.list({ limit: 1 }),
  ])
  if (sessions.data.some(session => session.livemode)) throw new Error('live_stripe_session_refused')
  // A successful balance-transaction read verifies actual-fee permission even
  // when a newly claimed Sandbox has no transactions yet.
  void balances
  return { checkoutRead: true, actualFeeRead: true } as const
}
