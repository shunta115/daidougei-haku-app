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

    const { performerId, action } = (req.body ?? {}) as { performerId?: string; action?: string }
    if (action && action !== 'status') {
      res.status(400).json({ error: 'Unknown action' })
      return
    }
    if (!performerId) {
      res.status(400).json({ error: 'performerId required' })
      return
    }
    if (performerId !== user.id) {
      res.status(403).json({ error: 'Only the performer can start Stripe Connect' })
      return
    }

    const sb = getAdminSupabase()
    const { data: profile, error: profileError } = await sb.from('profiles').select('role,status').eq('id', user.id).single()
    if (profileError) throw profileError
    if (!profile || !['performer', 'admin'].includes(profile.role) || !['pending', 'active'].includes(profile.status)) {
      res.status(403).json({ error: '受取設定を利用できません。アカウントの登録状況を確認してください。' })
      return
    }
    const { data: performer, error } = await sb.from('performers').select('*').eq('id', performerId).single()
    if (error || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }

    let accountId = performer.stripe_account_id as string | null
    res.setHeader('Cache-Control', 'no-store')
    if (action === 'status' && !accountId) {
      res.status(200).json({ connected: false, complete: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, needsInformation: false, underReview: false })
      return
    }
    const stripe = getStripe()
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
      }, { idempotencyKey: `performer-connect:${performerId}` })
      accountId = account.id
      const { error: saveError } = await sb.from('performers').update({ stripe_account_id: accountId }).eq('id', performerId)
      if (saveError) throw saveError
    } else {
      const account = await stripe.accounts.retrieve(accountId)
      const complete = isConnectedAccountChargeReady(account)
      const { error: saveError } = await sb
        .from('performers')
        .update({ stripe_onboarding_complete: complete })
        .eq('id', performerId)
      if (saveError) throw saveError
      if (action === 'status') {
        res.status(200).json({
          connected: true, complete,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          needsInformation: Boolean(account.requirements?.currently_due?.length || account.requirements?.past_due?.length),
          underReview: Boolean(account.requirements?.pending_verification?.length),
        })
        return
      }
    }

    const origin = getAppUrl(req)
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/live?stripe=refresh`,
      return_url: `${origin}/live?stripe=return`,
      type: 'account_onboarding',
    })

    res.status(200).json({ url: link.url })
  } catch {
    res.status(500).json({ error: '受取設定を確認できませんでした。時間をおいて再度お試しください。' })
  }
}
