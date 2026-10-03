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
      const [profiles, performers, lives, tips, orders, reports, ballots, slots] = await Promise.all([
        sb.from('profiles').select('id,role,status', { count: 'exact', head: false }).limit(4000),
        sb.from('performers').select('id,is_approved,review_status,is_live,stripe_onboarding_complete,stage_name,genre,city,bio,photo_url').limit(4000),
        sb.from('live_sessions').select('id,ended_at,heartbeat_at').is('ended_at', null),
        sb.from('tips').select('id,status,gross_amount_yen,amount_cents,platform_fee_yen,platform_fee_cents,refunded_amount_yen').limit(4000),
        sb.from('merch_orders').select('id,status,gross_amount_yen,amount_yen,platform_fee_yen,refunded_amount_yen').limit(4000),
        sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        sb.from('event_ballots').select('id', { count: 'exact', head: true }),
        sb.from('event_slots').select('id', { count: 'exact', head: true }).gte('date', '2026-10-10').lte('date', '2026-10-12'),
      ])
      const tipPaid = (tips.data ?? []).filter((row) => row.status === 'succeeded')
      const merchPaid = (orders.data ?? []).filter((row) => row.status === 'succeeded')
      const tipGmv = yenSum(tipPaid, ['gross_amount_yen', 'amount_cents'])
      const merchGmv = yenSum(merchPaid, ['gross_amount_yen', 'amount_yen'])
      const tipFee = yenSum(tipPaid, ['platform_fee_yen', 'platform_fee_cents'])
      const merchFee = yenSum(merchPaid, ['platform_fee_yen'])
      const now = Date.now()
      const staleLives = (lives.data ?? []).filter((row) => !row.heartbeat_at || now - new Date(String(row.heartbeat_at)).getTime() > 90_000).length
      const performerRows = performers.data ?? []
      const profileIncomplete = performerRows.filter((row) => !row.stage_name || !row.genre || !row.city || !row.bio || !row.photo_url).length
      res.status(200).json({
        ok: true,
        source: 'database',
        users: (profiles.data ?? []).length,
        fans: (profiles.data ?? []).filter((row) => row.role === 'fan').length,
        performers: (performers.data ?? []).length,
        approved: (performers.data ?? []).filter((row) => row.is_approved).length,
        pendingApproval: (performers.data ?? []).filter((row) => row.review_status === 'pending' || (!row.review_status && !row.is_approved)).length,
        rejected: (performers.data ?? []).filter((row) => row.review_status === 'rejected').length,
        liveNow: (lives.data ?? []).length,
        staleLives,
        stripeNotReady: performerRows.filter((row) => row.is_approved && !row.stripe_onboarding_complete).length,
        profileIncomplete,
        eventSlots1010to1012: slots.count ?? 0,
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
            const stripeRegistrationState = row.stripe_onboarding_complete ? 'ready' : row.stripe_account_id ? 'in_progress' : 'not_started'
            const { stripe_account_id: _hidden, ...safe } = row as Record<string, unknown>
            return {
              ...safe,
              stripe_registration_state: stripeRegistrationState,
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
        const reviewedAt = new Date().toISOString()
        const { data, error } = await sb.from('performers').update({
          is_approved: true,
          review_status: 'approved',
          reviewed_at: reviewedAt,
          reviewed_by: admin.id,
          rejection_reason: null,
        }).eq('id', id).select('id')
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
      if (action === 'reject') {
        const reason = String(payload.reason || '').trim()
        if (!reason) {
          res.status(400).json({ error: 'rejection reason required' })
          return
        }
        const { data, error } = await sb.from('performers').update({
          is_approved: false,
          is_live: false,
          share_location: false,
          review_status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.id,
          rejection_reason: reason.slice(0, 1000),
        }).eq('id', id).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('reject failed')
        await sb.from('live_sessions').update({ ended_at: new Date().toISOString(), ended_reason: 'admin_rejected' }).eq('performer_id', id).is('ended_at', null)
        await audit(admin.id, 'performer.reject', id, { reason: reason.slice(0, 1000) })
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
        const [{ data, error }, { data: rules }] = await Promise.all([
          sb.from('events').select('*').order('starts_on', { ascending: false }),
          sb.from('event_vote_rules').select('event_id,voting_enabled,voting_open,votes_per_device'),
        ])
        if (error) throw error
        const ruleByEvent = new Map((rules ?? []).map((row) => [String(row.event_id), row]))
        res.status(200).json({ ok: true, rows: (data ?? []).map((event) => ({ ...event, vote_rule: ruleByEvent.get(String(event.id)) ?? null })) })
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
          sb.from('event_lineup').select('performer_id,sort_order,is_voting_eligible').eq('event_id', id).order('sort_order'),
          sb.from('event_slots').select('id,date,start_time,end_time,venue_id,performer_id,stage_ja,status').eq('event_id', id).order('date').order('start_time'),
          sb.from('event_venues').select('id,name_ja,lat,lng').eq('event_id', id).order('sort_order'),
        ])
        const performerIds = (lineup ?? []).map((row) => String(row.performer_id))
        const { data: names } = performerIds.length ? await sb.from('performers').select('id,stage_name,genre').in('id', performerIds) : { data: [] }
        const performerById = new Map((names ?? []).map((row) => [String(row.id), row]))
        res.status(200).json({
          ok: true,
          lineup: (lineup ?? []).map((row) => ({ ...row, performer: performerById.get(String(row.performer_id)) ?? null })),
          slots: slots ?? [],
          venues: venues ?? [],
        })
        return
      }
      if (action === 'voting-feature') {
        const id = String(payload.id || '')
        const enabled = payload.enabled
        if (!id || typeof enabled !== 'boolean') {
          res.status(400).json({ error: 'id and enabled required' })
          return
        }
        const { error } = await sb.from('event_vote_rules').upsert({
          event_id: id,
          voting_enabled: enabled,
          voting_open: false,
          votes_per_device: 3,
          updated_at: new Date().toISOString(),
        })
        if (error) throw error
        await audit(admin.id, 'event.voting_feature', id, { enabled })
        res.status(200).json({ ok: true })
        return
      }
      if (action === 'voting-eligibility' || action === 'voting-eligibility-all-off') {
        const id = String(payload.id || '')
        if (!id) {
          res.status(400).json({ error: 'id required' })
          return
        }
        if (action === 'voting-eligibility-all-off') {
          const { error } = await sb.from('event_lineup').update({ is_voting_eligible: false }).eq('event_id', id)
          if (error) throw error
          await audit(admin.id, 'event.voting_eligibility_all_off', id)
          res.status(200).json({ ok: true })
          return
        }
        const performerId = String(payload.performerId || '')
        const eligible = payload.eligible
        if (!performerId || typeof eligible !== 'boolean') {
          res.status(400).json({ error: 'performerId and eligible required' })
          return
        }
        const { data, error } = await sb.from('event_lineup').update({ is_voting_eligible: eligible }).eq('event_id', id).eq('performer_id', performerId).select('performer_id').maybeSingle()
        if (error) throw error
        if (!data) {
          res.status(404).json({ error: 'lineup performer not found' })
          return
        }
        await audit(admin.id, 'event.voting_eligibility', performerId, { event_id: id, eligible })
        res.status(200).json({ ok: true })
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
        if (action === 'open') {
          const { data: enabledRule } = await sb.from('event_vote_rules').select('voting_enabled').eq('event_id', eventId).maybeSingle()
          if (!enabledRule?.voting_enabled) {
            res.status(409).json({ error: 'voting_disabled' })
            return
          }
        }
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
        const ranking = Array.isArray((desk.data as Json).ranking) ? (desk.data as { ranking: Array<Record<string, unknown>> }).ranking : []
        const ids = ranking.map((row) => String(row.performer_id || '')).filter(Boolean)
        const { data: names } = ids.length ? await sb.from('performers').select('id,stage_name').in('id', ids) : { data: [] }
        const byId = new Map((names ?? []).map((row) => [row.id, row.stage_name]))
        res.status(200).json({ ok: true, desk: { ...(desk.data as Json), ranking: ranking.map((row) => ({ ...row, stage_name: byId.get(String(row.performer_id)) ?? '名称未登録' })) }, source: 'rpc' })
        return
      }
      const [{ data: rule }, { data: ballots }, { data: legacyBallots }] = await Promise.all([
        sb.from('event_vote_rules').select('*').eq('event_id', eventId).maybeSingle(),
        sb.from('event_device_ballots').select('performer_id,device_hash,created_at').eq('event_id', eventId),
        sb.from('event_ballots').select('id').eq('event_id', eventId),
      ])
      const { data: eligibleRows } = await sb.from('event_lineup').select('performer_id').eq('event_id', eventId).eq('is_voting_eligible', true)
      const eligibleIds = new Set((eligibleRows ?? []).map((row) => String(row.performer_id)))
      const counts = new Map<string, number>()
      for (const row of ballots ?? []) {
        const performerId = String(row.performer_id)
        if (eligibleIds.has(performerId)) counts.set(performerId, (counts.get(performerId) ?? 0) + 1)
      }
      const performerIds = [...counts.keys()]
      const { data: performerNames } = performerIds.length ? await sb.from('performers').select('id,stage_name').in('id', performerIds) : { data: [] }
      const nameById = new Map((performerNames ?? []).map((row) => [row.id, row.stage_name]))
      res.status(200).json({
        ok: true,
        source: 'event_ballots',
        desk: {
          voting_enabled: Boolean(rule?.voting_enabled),
          voting_open: Boolean(rule?.voting_open),
          votes_per_device: Number(rule?.votes_per_device) || 3,
          total_votes: (ballots ?? []).length,
          unique_voters: new Set((ballots ?? []).map((row) => row.device_hash)).size,
          legacy_test_votes: (legacyBallots ?? []).length,
          ranking: [...counts].map(([performer_id, votes]) => ({ performer_id, stage_name: nameById.get(performer_id) ?? '名称未登録', votes })).sort((a, b) => b.votes - a.votes),
        },
      })
      return
    }

    if (resource === 'live') {
      const { data: open } = await sb.from('live_sessions').select('*,performers(stage_name)').is('ended_at', null).order('started_at', { ascending: false }).limit(50)
      const { data: recent } = await sb.from('live_sessions').select('*').order('started_at', { ascending: false }).limit(50)
      res.status(200).json({ ok: true, open: open ?? [], recent: recent ?? [] })
      return
    }

    if (resource === 'money' || resource === 'tips' || resource === 'merch') {
      const [{ data: tips }, { data: orders }] = await Promise.all([
        sb.from('tips').select('id,performer_id,fan_id,status,gross_amount_yen,amount_cents,stripe_fee_yen,net_after_stripe_yen,haku_fee_bps,haku_fee_yen,performer_share_yen,platform_fee_yen,platform_fee_cents,refunded_amount_yen,dispute_status,settlement_status,created_at').order('created_at', { ascending: false }).limit(200),
        sb.from('merch_orders').select('id,seller_id,buyer_id,status,gross_amount_yen,amount_yen,stripe_fee_yen,net_after_stripe_yen,haku_fee_bps,haku_fee_yen,performer_share_yen,platform_fee_yen,refunded_amount_yen,dispute_status,settlement_status,product_name,created_at').order('created_at', { ascending: false }).limit(200),
      ])
      const { data: payouts, error: payoutError } = await sb.from('performer_payouts').select('id,performer_id,amount_yen,status,stripe_payout_id,created_at,updated_at').order('created_at', { ascending: false }).limit(200)
      res.status(200).json({
        ok: true,
        kind: 'recorded',
        rates: { tip_system_fee_bps: TIP_SYSTEM_FEE_BPS, merch_system_fee_bps: MERCH_SYSTEM_FEE_BPS },
        tips: tips ?? [],
        orders: orders ?? [],
        stripe_processing_fee: { available: true, source: 'Stripe BalanceTransaction' },
        payouts: payoutError ? [] : payouts ?? [],
      })
      return
    }

    if (resource === 'reports') {
      if (action === 'patch') {
        const id = String(payload.id || '')
        const status = String(payload.status || '')
        if (!id || !['open', 'in_progress', 'resolved'].includes(status)) {
          res.status(400).json({ error: 'invalid report update' })
          return
        }
        const { error } = await sb.from('reports').update({ status }).eq('id', id)
        if (error) throw error
        await audit(admin.id, 'report.patch', id, { status })
        res.status(200).json({ ok: true })
        return
      }
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
