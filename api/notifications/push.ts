import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'

import selfTest from '../../server/notifications/selfTest.js'

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
  if (kind === 'live_start') {
    return locale === 'en'
      ? { title: `${name} is LIVE`, body: payload.title || 'Watch and support them on HAKU.' }
      : locale === 'zh-TW'
        ? { title: `${name}正在直播`, body: payload.title || '現在到HAKU觀看並支持！' }
        : { title: `${name}さんがLIVE配信中！`, body: payload.title || '今すぐHAKUで視聴して応援しよう！' }
  }
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
  if (req.query?.mode === 'self-test') return selfTest(req, res)
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  if (req.method === 'GET') return res.status(200).json({
    liveStartEnabled: process.env.ENABLE_LIVE_START_WEB_PUSH === 'true' && Boolean(process.env.WEB_PUSH_SUBJECT && process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY),
  })
  const isLive = req.body?.kind === 'live_start'
  if (req.body?.kind != null && req.body.kind !== 'appearance' && !isLive) return res.status(400).json({ error: 'invalid_kind' })
  let eventId = typeof req.body?.eventId === 'string' ? req.body.eventId : ''
  const liveSessionId = typeof req.body?.liveSessionId === 'string' ? req.body.liveSessionId : ''
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(isLive ? liveSessionId : eventId)) return res.status(400).json({ error: 'invalid_event' })
  // LIVE is opt-in and defaults OFF. An environment without the optional
  // migration never queries its tables or sends any LIVE Push.
  if (isLive && process.env.ENABLE_LIVE_START_WEB_PUSH !== 'true') {
    return res.status(202).json({ queued: false, dispatchEnabled: false })
  }
  const sb = getAdminSupabase()
  if (isLive) {
    const { data: session, error: sessionError } = await sb.from('live_sessions')
      .select('id,performer_id,ended_at').eq('id', liveSessionId).maybeSingle()
    if (sessionError || !session) return res.status(404).json({ error: 'live_not_found' })
    if (session.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })
    if (session.ended_at) return res.status(409).json({ error: 'live_ended' })
  } else {
    const { data: event, error: eventError } = await sb.from('appearance_notification_events')
      .select('id,performer_id').eq('id', eventId).maybeSingle()
    if (eventError || !event) return res.status(404).json({ error: 'event_not_found' })
    if (event.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })
    if (process.env.ENABLE_APPEARANCE_WEB_PUSH !== 'true') {
      return res.status(202).json({ queued: true, dispatchEnabled: false })
    }
  }
  const subject = process.env.WEB_PUSH_SUBJECT
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return res.status(503).json({ error: 'push_not_configured' })
  webpush.setVapidDetails(subject, publicKey, privateKey)
  if (isLive) {
    const enqueued = await sb.rpc('enqueue_live_start_push', { p_live_session_id: liveSessionId, p_owner_id: user.id })
    if (enqueued.error || typeof enqueued.data !== 'string') return res.status(503).json({ error: 'live_push_unavailable' })
    eventId = enqueued.data
  }
  const claimFunction = isLive ? 'claim_live_start_push_deliveries' : 'claim_appearance_push_deliveries'
  const deliveryTable = isLive ? 'live_push_deliveries' : 'push_notification_deliveries'
  const { data, error } = await sb.rpc(claimFunction, { p_event_id: eventId, p_limit: 100 })
  if (error) return res.status(isLive ? 503 : 500).json({ error: 'claim_failed' })
  const deliveries = (data ?? []) as Delivery[]
  let sent = 0
  let failed = 0
  for (const delivery of deliveries) {
    const copy = message(delivery.locale, delivery.payload)
    try {
      await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth },
      }, JSON.stringify({ ...copy, tag: isLive ? `live-${liveSessionId}` : `appearance-${eventId}`, url: delivery.payload.url || '/' }), { TTL: isLive ? 60 : 86400, urgency: 'normal' })
      await sb.from(deliveryTable).update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', delivery.delivery_id).eq('status', 'processing')
      await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', delivery.subscription_id)
      sent += 1
    } catch (cause) {
      const statusCode = typeof cause === 'object' && cause && 'statusCode' in cause ? Number(cause.statusCode) : 0
      const permanent = statusCode === 404 || statusCode === 410
      const terminal = permanent || delivery.attempts >= 4
      const safeError = statusCode ? `push_http_${statusCode}` : 'push_delivery_failed'
      await sb.from(deliveryTable).update({
        status: terminal ? 'failed' : 'queued', last_error: safeError,
        next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** delivery.attempts) * 60_000).toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', delivery.delivery_id).eq('status', 'processing')
      await sb.from('push_subscriptions').update({ ...(permanent ? { disabled_at: new Date().toISOString() } : {}), last_error: safeError, updated_at: new Date().toISOString() }).eq('id', delivery.subscription_id)
      failed += 1
    }
  }
  return res.status(200).json({ sent, failed, remaining: deliveries.length === 100 })
}
