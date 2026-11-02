import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { getAdminSupabase } from '../../api/stripe/_shared.js'
import { validPushEndpoint } from './liveStart.js'

type Job = { id: string; subscription_id: string; endpoint: string; p256dh: string; auth: string; payload: Record<string,string>; category: string; event_key: string; expires_at: string }
export default async function reminders(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control','no-store')
  if (req.method !== 'POST') return res.status(405).json({ error:'method_not_allowed' })
  const expected = process.env.NOTIFICATION_CRON_SECRET
  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (!expected || Buffer.byteLength(token) !== Buffer.byteLength(`Bearer ${expected}`) || !timingSafeEqual(Buffer.from(token),Buffer.from(`Bearer ${expected}`))) return res.status(401).json({error:'unauthorized'})
  if (Object.keys(req.body ?? {}).length) return res.status(400).json({error:'unexpected_parameter'})
  if (process.env.ENABLE_NOTIFICATION_REMINDERS !== 'true') return res.status(202).json({enabled:false})
  try {
    const sb=getAdminSupabase()
    const {error:collectError}=await sb.rpc('collect_notification_reminders')
    if(collectError) return res.status(503).json({error:'collection_failed',retry:false})
    const subject=process.env.WEB_PUSH_SUBJECT, publicKey=process.env.WEB_PUSH_VAPID_PUBLIC_KEY, privateKey=process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    if(process.env.ENABLE_NOTIFICATION_REMINDER_PUSH !== 'true') return res.status(200).json({collected:true,pushEnabled:false,sent:0})
    if(!subject||!publicKey||!privateKey) return res.status(503).json({error:'push_not_configured',retry:false})
    webpush.setVapidDetails(subject,publicKey,privateKey)
    const {data,error}=await sb.rpc('claim_notification_jobs',{p_limit:5})
    if(error) return res.status(503).json({error:'claim_failed',retry:false})
    let sent=0,unknown=0,suppressed=0,failed=0
    for(const job of (data ?? []) as Job[]) {
      const ttl=Math.min(300,Math.floor((Date.parse(job.expires_at)-Date.now())/1000))
      const {data:eligible,error:eligibilityError}=await sb.rpc('notification_job_eligible',{p_job_id:job.id})
      if(eligibilityError||eligible!==true||!validPushEndpoint(job.endpoint)||!(ttl>0)) {
        await sb.from('notification_jobs').update({status:'suppressed',last_error:'eligibility_changed'}).eq('id',job.id).eq('status','processing');suppressed++;continue
      }
      const name=String(job.payload.stageName || 'パフォーマー').slice(0,80)
      const title=job.category==='live_reminder'?'予約LIVEがまもなく始まります':job.category==='day_of'?'本日の出演予定':job.payload.eventType==='cancelled'?'出演中止のお知らせ':job.payload.eventType==='postponed'?'出演延期のお知らせ':job.payload.eventType==='important_update'?'出演予定が変更されました':'新しい出演予定'
      const body=job.category==='live_reminder'?job.payload.body:`${name}・${job.payload.title || ''}`
      try {
        await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify({title,body,tag:job.event_key,url:job.payload.url}),{TTL:ttl,urgency:'normal',timeout:5000})
      } catch(cause) {
        const status=typeof cause==='object'&&cause&&'statusCode' in cause?Number(cause.statusCode):0
        await sb.from('notification_jobs').update({status:status?'failed':'unknown',last_error:status?`push_http_${status}`:'delivery_unconfirmed'}).eq('id',job.id).eq('status','processing')
        if(status===404||status===410) await sb.from('push_subscriptions').update({disabled_at:new Date().toISOString(),last_error:`push_http_${status}`}).eq('id',job.subscription_id)
        if(status) failed++;else unknown++
        if(status===401||status===403) {await sb.from('notification_reminder_control').update({push_enabled:false}).eq('id',1);break}
        continue
      }
      sent++
      // Never catch an audit failure as a provider failure or release its claim.
      const {error:auditError}=await sb.from('notification_jobs').update({status:'sent',last_error:null}).eq('id',job.id).eq('status','processing')
      if(auditError) return res.status(503).json({error:'audit_unconfirmed',sent,retry:false})
    }
    return res.status(200).json({sent,failed,unknown,suppressed,retry:false})
  } catch {return res.status(503).json({error:'reminders_unavailable',retry:false})}
}
