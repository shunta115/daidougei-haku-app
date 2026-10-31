import type { VercelRequest, VercelResponse } from '@vercel/node'
import { RoomServiceClient } from 'livekit-server-sdk'
import webpush from 'web-push'
import { getAdminSupabase, requireAuthUser } from '../../api/stripe/_shared.js'
import { getLiveKitConfig, roomNameForPerformer } from '../../api/livekit/_shared.js'

export function liveHostHealthy(participants: { identity: string; tracks?: { muted?: boolean; type?: number }[] }[], owner: string) {
  return participants.some(p => p.identity === owner && p.tracks?.some(t => !t.muted && t.type === 1))
}

export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && (url.hostname === 'fcm.googleapis.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname))
  } catch { return false }
}

// Host heartbeats drive a bounded batch. No sleeping functions, new cron or retry loop.
export default async function liveStart(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const configured = process.env.ENABLE_SMART_PUSH === 'true' && process.env.ENABLE_LIVE_START_WEB_PUSH === 'true' && Boolean(process.env.WEB_PUSH_SUBJECT && process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY)
  if (req.method === 'GET') return res.status(200).json({ liveStartEnabled: configured })
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  if (!configured) return res.status(202).json({ dispatchEnabled: false })
  const id = req.body?.liveSessionId
  if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ error: 'invalid_session' })
  try {
    const sb = getAdminSupabase()
    const { data: session, error } = await sb.from('live_sessions').select('id,performer_id,ended_at,follower_push_requested').eq('id', id).maybeSingle()
    if (error) return res.status(503).json({ error: 'live_push_unavailable' })
    if (!session || session.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })
    if (session.ended_at || !session.follower_push_requested) return res.status(202).json({ sent: 0 })
    const { data: eventId, error: enqueueError } = await sb.rpc('enqueue_live_start_push', { p_live_session_id: id, p_owner_id: user.id })
    if (enqueueError) return res.status(503).json({ error: 'live_push_unavailable' })
    if (!eventId) return res.status(202).json({ sent: 0 })
    const { url, apiKey, apiSecret } = getLiveKitConfig()
    const rooms = new RoomServiceClient(url, apiKey, apiSecret)
    const cancel = async () => {
      await sb.from('live_push_events').update({ cancelled_at: new Date().toISOString() }).eq('id', eventId).is('cancelled_at', null)
    }
    const healthy = async () => {
      try { return liveHostHealthy(await rooms.listParticipants(roomNameForPerformer(user.id)), user.id) }
      catch { return false }
    }
    if (!await healthy()) { await cancel(); return res.status(202).json({ sent: 0, suppressed: true }) }
    const subject = process.env.WEB_PUSH_SUBJECT
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    if (!subject || !publicKey || !privateKey) return res.status(503).json({ error: 'push_not_configured' })
    webpush.setVapidDetails(subject, publicKey, privateKey)
    const { data, error: claimError } = await sb.rpc('claim_live_start_push_deliveries', { p_event_id: eventId, p_limit: 5 })
    if (claimError) return res.status(503).json({ error: 'claim_failed' })
    let sent = 0
    let failed = 0
    for (const delivery of data ?? []) {
      // Revalidate immediately before every send, including consent/unfollow changes
      // that happened after claim. No claim of a processing row is ever retried.
      const { data: eligible, error: eligibleError } = await sb.rpc('live_push_delivery_eligible', { p_delivery_id: delivery.delivery_id })
      if (eligibleError || !eligible || !validPushEndpoint(delivery.endpoint)) {
        await sb.from('live_push_deliveries').update({ status: 'suppressed', last_error: 'eligibility_changed' }).eq('id', delivery.delivery_id).eq('status', 'processing')
        continue
      }
      if (!await healthy()) {
        await cancel()
        await sb.from('live_push_deliveries').update({ status: 'suppressed', last_error: 'publisher_unhealthy' }).eq('id', delivery.delivery_id).eq('status', 'processing')
        break
      }
      const name = String(delivery.payload.stageName || 'パフォーマー').slice(0, 80)
      try {
        await webpush.sendNotification({ endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth } }, JSON.stringify({
          title: `🔴 ${name}がLIVEを開始！`, body: '今、パフォーマンスを配信中！タップしてHAKUで観よう！',
          tag: `live-${id}`, url: `/?watch=${user.id}&liveSession=${id}`,
        }), { TTL: 60, urgency: 'normal', timeout: 5000 })
      } catch (cause) {
        const status = typeof cause === 'object' && cause && 'statusCode' in cause ? Number(cause.statusCode) : 0
        await sb.from('live_push_deliveries').update({ status: 'failed', last_error: status ? `push_http_${status}` : 'delivery_unconfirmed' }).eq('id', delivery.delivery_id).eq('status', 'processing')
        if (status === 404 || status === 410) await sb.from('push_subscriptions').update({ disabled_at: new Date().toISOString(), last_error: `push_http_${status}` }).eq('id', delivery.subscription_id)
        failed++
        continue
      }
      sent++
      // An audit failure must never resend a push already accepted by its provider.
      await sb.from('live_push_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', delivery.delivery_id).eq('status', 'processing')
    }
    return res.status(200).json({ sent, failed, retry: false })
  } catch { return res.status(503).json({ error: 'live_push_unavailable', retry: false }) }
}
