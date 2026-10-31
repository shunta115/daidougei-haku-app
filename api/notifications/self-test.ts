import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'

// Explicitly user-initiated self-test only. Never accepts a target user or endpoint.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  if (req.body?.confirm !== 'send_one_self_test') return res.status(400).json({ error: 'confirmation_required' })
  if (process.env.ENABLE_SELF_PUSH_TEST !== 'true') return res.status(503).json({ error: 'test_disabled' })
  const subject = process.env.WEB_PUSH_SUBJECT
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return res.status(503).json({ error: 'push_not_configured' })
  const sb = getAdminSupabase()
  const { data, error } = await sb.from('push_subscriptions')
    .select('id,endpoint,p256dh,auth,last_success_at')
    .eq('user_id', user.id).is('disabled_at', null).limit(2)
  if (error) return res.status(503).json({ error: 'subscription_lookup_failed' })
  if (!data || data.length !== 1) return res.status(409).json({ error: 'exactly_one_subscription_required' })
  const subscription = data[0]
  // Cooldown avoids accidental repeated sends; no broadcast or arbitrary recipient.
  if (subscription.last_success_at && Date.now() - Date.parse(subscription.last_success_at) < 10 * 60_000) {
    return res.status(429).json({ error: 'recent_push' })
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ title: 'HAKU', body: '🎉 HAKUのプッシュ通知テストです！', tag: 'haku-self-test', url: '/' }),
      { TTL: 60, urgency: 'normal' },
    )
    await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_error: null }).eq('id', subscription.id).eq('user_id', user.id)
    return res.status(200).json({ accepted: true, sent: 1 })
  } catch {
    return res.status(502).json({ error: 'push_delivery_failed' })
  }
}
