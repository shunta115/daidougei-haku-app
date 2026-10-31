import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { getAdminSupabase, requireAuthUser } from '../../api/stripe/_shared.js'

// One campaign, one attempt. Never delete this claim to retry an uncertain delivery.
const CLAIM_KEY = 'haku_self_push_test_20261101'
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  try {
    const user = await requireAuthUser(req, res)
    if (!user) return
    if (process.env.ENABLE_SELF_PUSH_TEST !== 'true') return res.status(503).json({ error: 'test_disabled' })
    if (!process.env.SELF_PUSH_TEST_USER_ID || user.id !== process.env.SELF_PUSH_TEST_USER_ID) return res.status(403).json({ error: 'test_not_allowed' })
    if (req.body?.confirm !== 'send_one_self_test') return res.status(400).json({ error: 'confirmation_required' })
    if (Object.keys(req.body).some(key => key !== 'confirm')) return res.status(400).json({ error: 'unexpected_parameter' })
    const subject = process.env.WEB_PUSH_SUBJECT
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    const subscriptionId = process.env.SELF_PUSH_TEST_SUBSCRIPTION_ID
    if (!subject || !publicKey || !privateKey || !subscriptionId) return res.status(503).json({ error: 'push_not_configured' })
    const sb = getAdminSupabase()
    const { data, error } = await sb.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth').eq('user_id', user.id).is('disabled_at', null).limit(2)
    if (error) return res.status(503).json({ error: 'subscription_lookup_failed' })
    if (!data || data.length !== 1 || data[0].id !== subscriptionId) return res.status(409).json({ error: 'exact_subscription_required' })
    const subscription = data[0]
    const endpoint = new URL(subscription.endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'web.push.apple.com' || endpoint.port || endpoint.username || endpoint.password) return res.status(409).json({ error: 'apple_subscription_required' })
    webpush.setVapidDetails(subject, publicKey, privateKey)
    // The existing primary key serializes all concurrent invocations across instances.
    // Claim before contacting Apple; even a timeout must never trigger an automatic retry.
    const { error: claimError } = await sb.from('platform_settings').insert({
      key: CLAIM_KEY, value: { status: 'claimed', at: new Date().toISOString() },
    })
    if (claimError) return res.status(claimError.code === '23505' ? 409 : 503).json({ error: claimError.code === '23505' ? 'test_already_attempted' : 'claim_failed' })
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: 'HAKUプッシュ通知テスト', body: 'HAKUからiPhoneへのテスト通知です。', tag: 'haku-self-test-20261101', url: '/' }),
        { TTL: 300, urgency: 'high', timeout: 10_000 },
      )
    } catch {
      await sb.from('platform_settings').update({ value: { status: 'delivery_unconfirmed', at: new Date().toISOString() } }).eq('key', CLAIM_KEY)
      return res.status(502).json({ error: 'push_delivery_unconfirmed', retry: false })
    }
    const { error: auditError } = await sb.from('platform_settings').update({ value: { status: 'accepted', at: new Date().toISOString() } }).eq('key', CLAIM_KEY)
    const { error: historyError } = await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_error: null }).eq('id', subscription.id).eq('user_id', user.id)
    return res.status(200).json({ accepted: true, sent: 1, auditRecorded: !auditError && !historyError })
  } catch {
    return res.status(503).json({ error: 'test_unavailable', retry: false })
  }
}
