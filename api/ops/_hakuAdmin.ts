import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'
import { requireAdmin } from './_guard.js'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS } from '../../shared/fees.js'

type Json = Record<string, unknown>

async function readBody(req: VercelRequest): Promise<Json> {
  if (req.body && typeof req.body === 'object') return req.body as Json
  return {}
}

async function audit(adminId: string, action: string, targetId?: string | null, meta: Json = {}) {
  const sb = getAdminSupabase()
  await sb.from('admin_audit').insert({
    admin_id: adminId,
    action,
    target_id: targetId ?? null,
    meta,
  })
}

async function revokeSessions(userId: string) {
  const sb = getAdminSupabase()
  const adminAuth = sb.auth.admin as { signOut?: (id: string, scope?: 'global' | 'local' | 'others') => Promise<{ error: Error | null }> }
  if (typeof adminAuth.signOut === 'function') {
    const { error } = await adminAuth.signOut(userId, 'global')
    if (error) throw error
    return
  }
  throw new Error('Session revoke is unavailable on this Auth version')
}

function yenSum(rows: Array<Record<string, unknown>>, keys: string[]) {
  return rows.reduce((sum, row) => {
    for (const key of keys) {
      const n = Number(row[key])
      if (Number.isFinite(n)) return sum + n
    }
    return sum
  }, 0)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    const queryResource = typeof req.query.resource === 'string' ? req.query.resource : ''
    const body = req.method === 'GET' ? {} : await readBody(req)
    const resource = String(body.resource || queryResource || '')
    const action = String(body.action || 'list')
    const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Json
    const sb = getAdminSupabase()

    if (resource === 'me' || (req.method === 'GET' && !resource)) {
      const { data: profile } = await sb.from('profiles').select('id,display_name,email,role,status').eq('id', admin.id).maybeSingle()
      res.status(200).json({ ok: true, profile })
      return
    }

    if (resource === 'dashboard') {
      const [profiles, performers, lives, tips, orders, reports, ballots] = await Promise.all([
        sb.from('profiles').select('id,role,status', { count: 'exact', head: false }).limit(4000),
        sb.from('performers').select('id,is_approved,is_live,stripe_onboarding_complete').limit(4000),
        sb.from('live_sessions').select('id,ended_at').is('ended_at', null),
        sb.from('tips').select('id,status,gross_amount_yen,amount_cents,platform_fee_yen,platform_fee_cents,refunded_amount_yen').limit(4000),
        sb.from('merch_orders').select('id,status,gross_amount_yen,amount_yen,platform_fee_yen,refunded_amount_yen').limit(4000),
        sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        sb.from('event_ballots').select('id', { count: 'exact', head: true }),
      ])
      const tipPaid = (tips.data ?? []).filter((row) => row.status === 'succeeded')
      const merchPaid = (orders.data ?? []).filter((row) => row.status === 'succeeded')
      const tipGmv = yenSum(tipPaid, ['gross_amount_yen', 'amount_cents'])
      const merchGmv = yenSum(merchPaid, ['gross_amount_yen', 'amount_yen'])
      const tipFee = yenSum(tipPaid, ['platform_fee_yen', 'platform_fee_cents'])
      const merchFee = yenSum(merchPaid, ['platform_fee_yen'])
      res.status(200).json({
        ok: true,
        source: 'database',
        users: (profiles.data ?? []).length,
        fans: (profiles.data ?? []).filter((row) => row.role === 'fan').length,
        performers: (performers.data ?? []).length,
        approved: (performers.data ?? []).filter((row) => row.is_approved).length,
        pendingApproval: (performers.data ?? []).filter((row) => !row.is_approved).length,
        liveNow: (lives.data ?? []).length,
        openReports: reports.count ?? 0,
        ballots: ballots.count ?? 0,
        money: {
          kind: 'recorded',
          tip_gmv_yen: tipGmv,
          merch_gmv_yen: merchGmv,
          gmv_yen: tipGmv + merchGmv,
          haku_system_fee_yen: tipFee + merchFee,
          performer_after_system_fee_yen: tipGmv + merchGmv - (tipFee + merchFee),
          tip_refunded_yen: yenSum(tips.data ?? [], ['refunded_amount_yen']),
          merch_refunded_yen: yenSum(orders.data ?? [], ['refunded_amount_yen']),
          stripe_processing_fee: { available: false, reason: 'Stripe決済手数料はDBに保存していません' },
          payouts: { available: false, reason: '銀行支払済/未払いはStripe Connect側の記録です' },
        },
      })
      return
    }

    if (resource === 'users') {
      if (action === 'list' || req.method === 'GET') {
        const { data, error } = await sb.from('profiles').select('id,display_name,email,role,status,created_at,updated_at').order('created_at', { ascending: false }).limit(300)
        if (error) throw error
        res.status(200).json({ ok: true, rows: data ?? [] })
        return
      }
      const id = String(payload.id || '')
      if (!id) {
        res.status(400).json({ error: 'id required' })
        return
      }
      if (id === admin.id) {
        res.status(400).json({ error: 'cannot modify self' })
        return
      }
      if (action === 'suspend') {
        const { error } = await sb.from('profiles').update({ status: 'suspended' }).eq('id', id)
        if (error) throw error
        await sb.from('performers').update({ is_live: false, is_approved: false }).eq('id', id)
        await revokeSessions(id)
        await audit(admin.id, 'user.suspend', id)
        res.status(200).json({ ok: true })
        return
      }
      if (action === 'soft-delete') {
        const { error } = await sb.from('profiles').update({ status: 'deleted', display_name: 'Deleted' }).eq('id', id)
        if (error) throw error
        await sb.from('performers').update({ is_live: false, is_approved: false, stage_name: 'Deleted' }).eq('id', id)
        await revokeSessions(id)
        await audit(admin.id, 'user.soft_delete', id)
        res.status(200).json({ ok: true })
        return
      }
    }

    if (resource === 'performers') {
      if (action === 'list' || req.method === 'GET') {
        const [{ data: performers, error }, { data: profiles, error: profileError }] = await Promise.all([
          sb.from('performers').select('*').order('created_at', { ascending: false }).limit(300),
          sb.from('profiles').select('id,status,email,display_name,role').in('role', ['performer', 'admin']),
        ])
        if (error) throw error
        if (profileError) throw profileError
        const byId = new Map((profiles ?? []).map((row) => [row.id, row]))
        res.status(200).json({
          ok: true,
          rows: (performers ?? []).map((row) => {
            const profile = byId.get(row.id)
            const { stripe_account_id: _hidden, ...safe } = row as Record<string, unknown>
            return {
              ...safe,
              email: profile?.email ?? null,
              account_status: profile?.status ?? 'unknown',
              display_name: profile?.display_name ?? null,
            }
          }),
        })
        return
      }
      const id = String(payload.id || '')
      if (!id) {
        res.status(400).json({ error: 'id required' })
        return
      }
      if (action === 'approve') {
        const { data, error } = await sb.from('performers').update({ is_approved: true }).eq('id', id).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('approve failed')
        const { error: perr } = await sb.from('profiles').update({ status: 'active' }).eq('id', id)
        if (perr) {
          await sb.from('performers').update({ is_approved: false, is_live: false, share_location: false }).eq('id', id)
          throw perr
        }
        await audit(admin.id, 'performer.approve', id)
        res.status(200).json({ ok: true })
        return
      }
      if (action === 'unpublish') {
        const { data, error } = await sb.from('performers').update({
          is_approved: false,
          is_live: false,
          share_location: false,
          live_started_at: null,
          live_title: null,
          lat: null,
          lng: null,
          location_updated_at: null,
        }).eq('id', id).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('unpublish failed')
        await sb.from('live_sessions').update({ ended_at: new Date().toISOString(), ended_reason: 'admin_forced' }).eq('performer_id', id).is('ended_at', null)
        await audit(admin.id, 'performer.unpublish', id)
        res.status(200).json({ ok: true })
        return
      }
    }

    if (resource === 'events') {
      if (action === 'list' || req.method === 'GET') {
        const { data, error } = await sb.from('events').select('*').order('starts_on', { ascending: false })
        if (error) throw error
        res.status(200).json({ ok: true, rows: data ?? [] })
        return
      }
      if (action === 'patch') {
        const id = String(payload.id || '')
        const patch = (payload.patch && typeof payload.patch === 'object' ? payload.patch : {}) as Json
        if (!id) {
          res.status(400).json({ error: 'id required' })
          return
        }
        const allowed = ['status', 'name_ja', 'name_en', 'date_label', 'place_label', 'hours_label', 'is_featured']
        const next: Json = {}
        for (const key of allowed) {
          if (key in patch) next[key] = patch[key]
        }
        if (next.status && !['draft', 'published', 'archived'].includes(String(next.status))) {
          res.status(400).json({ error: 'invalid status' })
          return
        }
        const { error } = await sb.from('events').update(next).eq('id', id)
        if (error) throw error
        await audit(admin.id, 'event.patch', id, next)
        res.status(200).json({ ok: true })
        return
      }
      if (action === 'lineup') {
        const id = String(payload.id || '')
        const [{ data: lineup }, { data: slots }, { data: venues }] = await Promise.all([
          sb.from('event_lineup').select('performer_id,sort_order').eq('event_id', id).order('sort_order'),
          sb.from('event_slots').select('id,date,start_time,end_time,venue_id,performer_id,stage_ja,status').eq('event_id', id).order('date').order('start_time'),
          sb.from('event_venues').select('id,name_ja,lat,lng').eq('event_id', id).order('sort_order'),
        ])
        res.status(200).json({ ok: true, lineup: lineup ?? [], slots: slots ?? [], venues: venues ?? [] })
        return
      }
    }

    if (resource === 'votes') {
      const eventId = String(payload.eventId || req.query.eventId || '')
      if (!eventId) {
        res.status(400).json({ error: 'eventId required' })
        return
      }
      if (action === 'open' || action === 'close') {
        const { error } = await sb.from('event_vote_rules').upsert({
          event_id: eventId,
          voting_open: action === 'open',
          updated_at: new Date().toISOString(),
        })
        if (error) throw error
        await audit(admin.id, `vote.${action}`, eventId)
        res.status(200).json({ ok: true })
        return
      }
      const desk = await sb.rpc('admin_event_vote_desk', { p_event_id: eventId })
      if (!desk.error && desk.data) {
        res.status(200).json({ ok: true, desk: desk.data, source: 'rpc' })
        return
      }
      const [{ data: rule }, { data: ballots }] = await Promise.all([
        sb.from('event_vote_rules').select('*').eq('event_id', eventId).maybeSingle(),
        sb.from('event_ballots').select('performer_id,fan_id,created_at').eq('event_id', eventId),
      ])
      const counts = new Map<string, number>()
      for (const row of ballots ?? []) counts.set(row.performer_id as string, (counts.get(row.performer_id as string) ?? 0) + 1)
      res.status(200).json({
        ok: true,
        source: 'event_ballots',
        desk: {
          voting_open: Boolean(rule?.voting_open),
          total_votes: (ballots ?? []).length,
          unique_voters: new Set((ballots ?? []).map((row) => row.fan_id)).size,
          ranking: [...counts].map(([performer_id, votes]) => ({ performer_id, votes })).sort((a, b) => b.votes - a.votes),
        },
      })
      return
    }

    if (resource === 'live') {
      const { data: open } = await sb.from('live_sessions').select('*').is('ended_at', null).order('started_at', { ascending: false }).limit(50)
      const { data: recent } = await sb.from('live_sessions').select('*').order('started_at', { ascending: false }).limit(50)
      res.status(200).json({ ok: true, open: open ?? [], recent: recent ?? [] })
      return
    }

    if (resource === 'money' || resource === 'tips' || resource === 'merch') {
      const [{ data: tips }, { data: orders }] = await Promise.all([
        sb.from('tips').select('id,performer_id,fan_id,status,gross_amount_yen,amount_cents,platform_fee_yen,platform_fee_cents,refunded_amount_yen,dispute_status,created_at').order('created_at', { ascending: false }).limit(200),
        sb.from('merch_orders').select('id,seller_id,buyer_id,status,gross_amount_yen,amount_yen,platform_fee_yen,refunded_amount_yen,dispute_status,product_name,created_at').order('created_at', { ascending: false }).limit(200),
      ])
      res.status(200).json({
        ok: true,
        kind: 'recorded',
        rates: { tip_system_fee_bps: TIP_SYSTEM_FEE_BPS, merch_system_fee_bps: MERCH_SYSTEM_FEE_BPS },
        tips: tips ?? [],
        orders: orders ?? [],
        stripe_processing_fee: { available: false, reason: '決済手数料の実績はStripeにあり、固定値では表示しません' },
        payouts: { available: false, reason: '支払済/未払いはStripeの入金記録が必要です' },
      })
      return
    }

    if (resource === 'reports') {
      const { data, error } = await sb.from('reports').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      res.status(200).json({ ok: true, rows: data ?? [] })
      return
    }

    if (resource === 'settings' && action === 'get') {
      const { data } = await sb.from('platform_settings').select('key,value').in('key', ['tip_fee_bps', 'merch_fee_bps', 'tip_min_amount_yen'])
      res.status(200).json({ ok: true, rows: data ?? [] })
      return
    }

    res.status(404).json({ error: 'unknown resource' })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'admin failed' })
  }
}
