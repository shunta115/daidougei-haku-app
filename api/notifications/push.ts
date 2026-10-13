import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'

type Delivery = {
  delivery_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
  locale: 'ja' | 'en' | 'zh-TW'
  payload: Record<string, string>
  attempts: number
}

function message(locale: Delivery['locale'], payload: Delivery['payload']) {
  const name = payload.stageName || (locale === 'en' ? 'A performer' : locale === 'zh-TW' ? '表演者' : 'パフォーマー')
  const kind = payload.eventType
  if (locale === 'en') {
    return {
      title: kind === 'cancelled' ? 'Performance cancelled' : kind === 'postponed' ? 'Performance postponed' : kind === 'important_update' ? 'Performance updated' : 'New performance announced',
      body: `${name}: ${payload.title || ''} · ${payload.date || ''} ${String(payload.startTime || '').slice(0, 5)}`,
    }
  }
  if (locale === 'zh-TW') {
    return {
      title: kind === 'cancelled' ? '演出取消通知' : kind === 'postponed' ? '演出延期通知' : kind === 'important_update' ? '演出資訊已更新' : '新的演出預定',
      body: `${name}：${payload.title || ''}・${payload.date || ''} ${String(payload.startTime || '').slice(0, 5)}`,
    }
  }
  return {
    title: kind === 'cancelled' ? '出演中止のお知らせ' : kind === 'postponed' ? '出演延期のお知らせ' : kind === 'important_update' ? '出演予定が変更されました' : '新しい出演予定が公開されました',
    body: `${name}さん：${payload.title || ''}・${payload.date || ''} ${String(payload.startTime || '').slice(0, 5)}`,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId : ''
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return res.status(400).json({ error: 'invalid_event' })

  const sb = getAdminSupabase()
  const { data: event, error: eventError } = await sb
    .from('appearance_notification_events')
    .select('id,performer_id')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError || !event) return res.status(404).json({ error: 'event_not_found' })
  if (event.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })

  if (process.env.ENABLE_APPEARANCE_WEB_PUSH !== 'true') {
    return res.status(202).json({ queued: true, dispatchEnabled: false })
  }
  const subject = process.env.WEB_PUSH_SUBJECT
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return res.status(503).json({ error: 'push_not_configured' })
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const { data, error } = await sb.rpc('claim_appearance_push_deliveries', { p_event_id: eventId, p_limit: 100 })
  if (error) return res.status(500).json({ error: 'claim_failed' })
  const deliveries = (data ?? []) as Delivery[]
  let sent = 0
  let failed = 0
  for (const delivery of deliveries) {
    const copy = message(delivery.locale, delivery.payload)
    try {
      await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth },
      }, JSON.stringify({ ...copy, tag: `appearance-${eventId}`, url: delivery.payload.url || '/' }), { TTL: 86400, urgency: 'normal' })
      await sb.from('push_notification_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', delivery.delivery_id).eq('status', 'processing')
      await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', delivery.subscription_id)
      sent += 1
    } catch (cause) {
      const statusCode = typeof cause === 'object' && cause && 'statusCode' in cause ? Number(cause.statusCode) : 0
      const permanent = statusCode === 404 || statusCode === 410
      const terminal = permanent || delivery.attempts >= 4
      const safeError = statusCode ? `push_http_${statusCode}` : 'push_delivery_failed'
      await sb.from('push_notification_deliveries').update({
        status: terminal ? 'failed' : 'queued', last_error: safeError,
        next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** delivery.attempts) * 60_000).toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', delivery.delivery_id).eq('status', 'processing')
      await sb.from('push_subscriptions').update({ ...(permanent ? { disabled_at: new Date().toISOString() } : {}), last_error: safeError, updated_at: new Date().toISOString() }).eq('id', delivery.subscription_id)
      failed += 1
    }
  }
  return res.status(200).json({ sent, failed, remaining: deliveries.length === 100 })
}
