import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from './_shared.js'

/** Read-only receipt lookup. The opaque Checkout session ID is a bearer capability.
 * Return no payer, amount, account, or other private receipt data. Only signed
 * Stripe webhooks may finalize the payment; this endpoint never writes a ledger.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const origin = req.headers.origin
  const host = req.headers.host
  const site = req.headers['sec-fetch-site']
  let sameOrigin = false
  try {
    const url = new URL(typeof origin === 'string' ? origin : '')
    const protocol = typeof host === 'string' && /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http:' : 'https:'
    sameOrigin = url.origin === `${protocol}//${host}`
  } catch { /* Missing or malformed Origin is not a browser receipt request. */ }
  if (!sameOrigin || (site && site !== 'same-origin') || !req.headers['content-type']?.startsWith('application/json')) {
    res.status(403).json({ code: 'invalid_payment_request' })
    return
  }
  const sessionId = req.body?.sessionId
  if (typeof sessionId !== 'string' || !/^cs_(test|live)_[a-zA-Z0-9]{16,200}$/.test(sessionId)) {
    res.status(400).json({ code: 'invalid_payment_request' })
    return
  }
  try {
    const { data, error } = await getAdminSupabase()
      .from('tips')
      .select('status,performer_id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle()
    if (error) throw error
    // Unknown and not-yet-persisted sessions are indistinguishable. This also
    // covers a return arriving before the Checkout creation write completes.
    if (!data || data.status === 'pending') {
      res.status(200).json({ ok: false, status: 'pending' })
      return
    }
    if (data.status !== 'succeeded') {
      res.status(200).json({ ok: false, status: 'unconfirmed' })
      return
    }
    res.status(200).json({ ok: true, status: 'paid', performerId: data.performer_id })
  } catch {
    res.status(503).json({ code: 'confirmation_unavailable' })
  }
}
