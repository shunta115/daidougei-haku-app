import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getAppUrl, getStripe, isConnectedAccountChargeReady, requireAuthUser } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await requireAuthUser(req, res)
    if (!user) return

    const { performerId } = req.body as { performerId?: string }
    if (!performerId) {
      res.status(400).json({ error: 'performerId required' })
      return
    }
    if (performerId !== user.id) {
      res.status(403).json({ error: 'Only the performer can start Stripe Connect' })
      return
    }

    const sb = getAdminSupabase()
    const { data: performer, error } = await sb.from('performers').select('*').eq('id', performerId).single()
    if (error || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }

    const stripe = getStripe()
    let accountId = performer.stripe_account_id as string | null
    if (!accountId) {
      const account = await stripe.accounts.create({
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { performer_id: performerId },
      })
      accountId = account.id
      await sb.from('performers').update({ stripe_account_id: accountId }).eq('id', performerId)
    } else {
      const account = await stripe.accounts.retrieve(accountId)
      await sb
        .from('performers')
        .update({ stripe_onboarding_complete: isConnectedAccountChargeReady(account) })
        .eq('id', performerId)
    }

    const origin = getAppUrl(req)
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/live?stripe=refresh`,
      return_url: `${origin}/live?stripe=return`,
      type: 'account_onboarding',
    })

    res.status(200).json({ url: link.url })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Connect failed' })
  }
}
