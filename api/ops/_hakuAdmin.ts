import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getStripe, isConnectedAccountChargeReady } from '../stripe/_shared.js'
import { getPerformerPayoutView } from '../stripe/_payouts.js'
import { requireAdmin, requireSuperAdmin } from './_guard.js'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS, settleSaleAfterRefund } from '../../shared/fees.js'

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

function currentSettlement(row: Record<string, unknown>, feeBps: number, grossKeys: string[]) {
  const grossYen = grossKeys.map((key) => Number(row[key])).find(Number.isFinite) ?? 0
  const refundedYen = Math.max(0, Number(row.refunded_amount_yen) || 0)
  const stripeFeeYen = Math.max(0, Number(row.stripe_fee_yen) || 0)
  return settleSaleAfterRefund(grossYen, stripeFeeYen, refundedYen, feeBps)
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
      res.status(200).json({ ok: true, profile, admin_permission: admin.adminPermission })
      return
    }

    if (resource === 'admins') {
      if (action === 'list' || req.method === 'GET') {
        const { data: rows, error } = await sb.from('admin_members').select('user_id,name,email,permission,status,created_at,updated_at,disabled_at').order('created_at')
        if (error) throw error
        const adminAuth = sb.auth.admin
        const withLogin = await Promise.all((rows ?? []).map(async (row) => {
          const { data } = await adminAuth.getUserById(row.user_id)
          return { ...row, last_login_at: data.user?.last_sign_in_at ?? null }
        }))
        res.status(200).json({ ok: true, rows: withLogin, can_manage: admin.adminPermission === 'super_admin' })
        return
      }

      if (!requireSuperAdmin(admin, res)) return

      if (action === 'invite') {
        const name = String(payload.name || '').trim().slice(0, 120)
        const email = String(payload.email || '').trim().toLowerCase()
        const permission = payload.permission === 'super_admin' ? 'super_admin' : 'admin'
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          res.status(400).json({ error: 'valid name and email required' })
          return
        }
        const { data: usersPage, error: usersError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (usersError) throw usersError
        let target = usersPage.users.find((candidate) => candidate.email?.trim().toLowerCase() === email) ?? null
        let invited = false
        if (target) {
          const { data: existingProfile, error: existingProfileError } = await sb.from('profiles').select('role').eq('id', target.id).maybeSingle()
          if (existingProfileError) throw existingProfileError
          if (existingProfile?.role !== 'admin') {
            res.status(409).json({ error: 'email already belongs to a non-admin account' })
            return
          }
        }
        if (!target) {
          const siteOrigin = process.env.PUBLIC_SITE_URL
            || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://daidougei-haku-app.vercel.app')
          const result = await sb.auth.admin.inviteUserByEmail(email, {
            data: { display_name: name, role: 'fan' },
            redirectTo: `${siteOrigin.replace(/\/$/, '')}/haku-admin`,
          })
          if (result.error) throw result.error
          target = result.data.user
          invited = true
        }
        if (!target) throw new Error('administrator account was not created')
        const { error: memberError } = await sb.from('admin_members').upsert({
          user_id: target.id,
          name,
          email,
          permission,
          status: 'active',
          invited_by: admin.id,
          disabled_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (memberError) throw memberError
        const { error: profileError } = await sb.from('profiles').update({ email, display_name: name, role: 'admin', status: 'active' }).eq('id', target.id)
        if (profileError) throw profileError
        await audit(admin.id, 'admin.invite', target.id, { permission, invited })
        res.status(200).json({ ok: true, invited })
        return
      }

      const targetId = String(payload.userId || '')
      if (!targetId) {
        res.status(400).json({ error: 'userId required' })
        return
      }
      if (targetId === admin.id) {
        res.status(400).json({ error: 'cannot change your own administrator access' })
        return
      }

      if (action === 'permission') {
        const permission = payload.permission === 'super_admin' ? 'super_admin' : 'admin'
        const { data: target } = await sb.from('admin_members').select('permission,status').eq('user_id', targetId).maybeSingle()
        if (target?.permission === 'super_admin' && permission !== 'super_admin' && target.status === 'active') {
          const { count } = await sb.from('admin_members').select('user_id', { count: 'exact', head: true }).eq('permission', 'super_admin').eq('status', 'active')
          if ((count ?? 0) <= 1) {
            res.status(409).json({ error: 'at least one active super admin is required' })
            return
          }
        }
        const { error } = await sb.from('admin_members').update({ permission, updated_at: new Date().toISOString() }).eq('user_id', targetId)
        if (error) throw error
        await audit(admin.id, 'admin.permission', targetId, { permission })
        res.status(200).json({ ok: true })
        return
      }

      if (action === 'status') {
        const status = payload.status === 'active' ? 'active' : 'disabled'
        const { data: target } = await sb.from('admin_members').select('permission,status').eq('user_id', targetId).maybeSingle()
        if (!target) {
          res.status(404).json({ error: 'administrator not found' })
          return
        }
        if (target.permission === 'super_admin' && target.status === 'active' && status === 'disabled') {
          const { count } = await sb.from('admin_members').select('user_id', { count: 'exact', head: true }).eq('permission', 'super_admin').eq('status', 'active')
          if ((count ?? 0) <= 1) {
            res.status(409).json({ error: 'at least one active super admin is required' })
            return
          }
        }
        const now = new Date().toISOString()
        const { error: memberError } = await sb.from('admin_members').update({ status, disabled_at: status === 'disabled' ? now : null, updated_at: now }).eq('user_id', targetId)
        if (memberError) throw memberError
        const { error: profileError } = await sb.from('profiles').update({ status: status === 'active' ? 'active' : 'suspended' }).eq('id', targetId).eq('role', 'admin')
        if (profileError) throw profileError
        if (status === 'disabled') await revokeSessions(targetId)
        await audit(admin.id, `admin.${status}`, targetId)
        res.status(200).json({ ok: true })
        return
      }
    }

    if (resource === 'dashboard') {
      const [profiles, performers, lives, tips, orders, reports, ballots, slots] = await Promise.all([
        sb.from('profiles').select('id,role,status', { count: 'exact', head: false }).limit(4000),
        sb.from('performers').select('id,is_approved,review_status,is_live,stripe_onboarding_complete,stage_name,genre,city,bio,photo_url').limit(4000),
        sb.from('live_sessions').select('id,ended_at,heartbeat_at').is('ended_at', null),
        sb.from('tips').select('id,status,gross_amount_yen,amount_cents,stripe_fee_yen,haku_fee_yen,performer_share_yen,settlement_status,refunded_amount_yen').limit(4000),
        sb.from('merch_orders').select('id,status,gross_amount_yen,amount_yen,stripe_fee_yen,haku_fee_yen,performer_share_yen,settlement_status,refunded_amount_yen').limit(4000),
        sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        sb.from('event_ballots').select('id', { count: 'exact', head: true }),
        sb.from('event_slots').select('id', { count: 'exact', head: true }).gte('date', '2026-10-10').lte('date', '2026-10-12'),
      ])
      const tipPaid = (tips.data ?? []).filter((row) => row.status === 'succeeded')
      const merchPaid = (orders.data ?? []).filter((row) => row.status === 'succeeded')
      const tipGmv = yenSum(tipPaid, ['gross_amount_yen', 'amount_cents'])
      const merchGmv = yenSum(merchPaid, ['gross_amount_yen', 'amount_yen'])
      const tipSettled = tipPaid.filter((row) => row.settlement_status === 'settled')
      const merchSettled = merchPaid.filter((row) => row.settlement_status === 'settled')
      const tipFee = tipSettled.reduce((sum, row) => sum + currentSettlement(row, TIP_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_cents']).hakuFeeYen, 0)
      const merchFee = merchSettled.reduce((sum, row) => sum + currentSettlement(row, MERCH_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_yen']).hakuFeeYen, 0)
      const stripeFee = yenSum(tipSettled, ['stripe_fee_yen']) + yenSum(merchSettled, ['stripe_fee_yen'])
      const performerShare =
        tipSettled.reduce((sum, row) => sum + currentSettlement(row, TIP_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_cents']).performerShareYen, 0) +
        merchSettled.reduce((sum, row) => sum + currentSettlement(row, MERCH_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_yen']).performerShareYen, 0)
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
          performer_after_system_fee_yen: performerShare,
          tip_refunded_yen: yenSum(tips.data ?? [], ['refunded_amount_yen']),
          merch_refunded_yen: yenSum(orders.data ?? [], ['refunded_amount_yen']),
          stripe_processing_fee: { available: true, amount_yen: stripeFee, source: 'Stripe BalanceTransaction（精算済みのみ）' },
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
        const [{ data: lineup }, { data: slots }, { data: venues }, { data: approvedPerformers }, { data: guestAppearances }] = await Promise.all([
          sb.from('event_lineup').select('performer_id,sort_order,is_voting_eligible').eq('event_id', id).order('sort_order'),
          sb.from('event_slots').select('id,date,start_time,end_time,venue_id,performer_id,performer_name_ja,stage_ja,status,performance_type,round_no,ranking_position,source_key,source_label').eq('event_id', id).order('date').order('start_time'),
          sb.from('event_venues').select('id,name_ja,lat,lng').eq('event_id', id).order('sort_order'),
          sb.from('performers').select('id,stage_name,genre').eq('is_approved', true).order('stage_name'),
          sb.from('event_guest_appearances').select('id,official_name_ja,appearance_type,appearance_date,linked_performer_id,sort_order').eq('event_id', id).order('appearance_date').order('sort_order'),
        ])
        const performerIds = (lineup ?? []).map((row) => String(row.performer_id))
        const { data: names } = performerIds.length ? await sb.from('performers').select('id,stage_name,genre').in('id', performerIds) : { data: [] }
        const performerById = new Map((names ?? []).map((row) => [String(row.id), row]))
        res.status(200).json({
          ok: true,
          lineup: (lineup ?? []).map((row) => ({ ...row, performer: performerById.get(String(row.performer_id)) ?? null })),
          slots: slots ?? [],
          venues: venues ?? [],
          approvedPerformers: approvedPerformers ?? [],
          guestAppearances: guestAppearances ?? [],
        })
        return
      }
      if (action === 'guest-appearance-link') {
        const id = String(payload.id || '')
        const officialName = String(payload.officialName || '').trim()
        const performerId = payload.performerId ? String(payload.performerId) : null
        if (!id || !officialName) {
          res.status(400).json({ error: 'id and officialName required' })
          return
        }
        if (performerId) {
          const { data: performer, error: performerError } = await sb
            .from('performers')
            .select('id,stage_name')
            .eq('id', performerId)
            .eq('is_approved', true)
            .maybeSingle()
          if (performerError) throw performerError
          if (!performer) {
            res.status(400).json({ error: 'approved performer required' })
            return
          }
        }
        const { data: appearances, error: appearanceError } = await sb
          .from('event_guest_appearances')
          .select('id')
          .eq('event_id', id)
          .eq('official_name_ja', officialName)
        if (appearanceError) throw appearanceError
        if (!appearances?.length) {
          res.status(404).json({ error: 'official appearance not found' })
          return
        }
        const { error } = await sb
          .from('event_guest_appearances')
          .update({ linked_performer_id: performerId, updated_at: new Date().toISOString() })
          .eq('event_id', id)
          .eq('official_name_ja', officialName)
        if (error) throw error
        await audit(admin.id, 'event.guest_appearance_link', id, {
          official_name_ja: officialName,
          linked_performer_id: performerId,
          appearance_count: appearances.length,
        })
        res.status(200).json({ ok: true, updated: appearances.length })
        return
      }
      if (action === 'slot-performer-link') {
        const id = String(payload.id || '')
        const officialName = String(payload.officialName || '').trim()
        const performerId = payload.performerId ? String(payload.performerId) : null
        if (!id || !officialName) {
          res.status(400).json({ error: 'id and officialName required' })
          return
        }
        if (performerId) {
          const { data: performer, error: performerError } = await sb
            .from('performers')
            .select('id')
            .eq('id', performerId)
            .eq('is_approved', true)
            .maybeSingle()
          if (performerError) throw performerError
          if (!performer) {
            res.status(400).json({ error: 'approved performer required' })
            return
          }
        }
        const { data: slots, error: slotError } = await sb
          .from('event_slots')
          .select('id')
          .eq('event_id', id)
          .eq('performer_name_ja', officialName)
        if (slotError) throw slotError
        if (!slots?.length) {
          res.status(404).json({ error: 'official slot performer not found' })
          return
        }
        const { error } = await sb
          .from('event_slots')
          .update({ performer_id: performerId })
          .eq('event_id', id)
          .eq('performer_name_ja', officialName)
        if (error) throw error
        await audit(admin.id, 'event.slot_performer_link', id, {
          official_name_ja: officialName,
          linked_performer_id: performerId,
          slot_count: slots.length,
        })
        res.status(200).json({ ok: true, updated: slots.length })
        return
      }
      if (action === 'lineup-set') {
        const id = String(payload.id || '')
        const requested = Array.isArray(payload.performerIds)
          ? [...new Set(payload.performerIds.map((value) => String(value)).filter(Boolean))]
          : []
        if (!id || requested.length > 500) {
          res.status(400).json({ error: 'valid id and performerIds required' })
          return
        }
        const [approvedResult, currentResult, scheduledResult] = await Promise.all([
          requested.length
            ? sb.from('performers').select('id').in('id', requested).eq('is_approved', true)
            : Promise.resolve({ data: [] as Array<{ id: string }> }),
          sb.from('event_lineup').select('performer_id,sort_order,is_voting_eligible').eq('event_id', id).order('sort_order'),
          sb.from('event_slots').select('performer_id').eq('event_id', id).not('performer_id', 'is', null),
        ])
        if (approvedResult.error) throw approvedResult.error
        if (currentResult.error) throw currentResult.error
        if (scheduledResult.error) throw scheduledResult.error
        const approved = approvedResult.data
        const current = currentResult.data
        const scheduled = scheduledResult.data
        const approvedIds = new Set((approved ?? []).map((row) => String(row.id)))
        const invalid = requested.filter((performerId) => !approvedIds.has(performerId))
        if (invalid.length) {
          res.status(400).json({ error: 'approved performers only' })
          return
        }
        const requestedSet = new Set(requested)
        const scheduledIds = [...new Set((scheduled ?? []).map((row) => String(row.performer_id)).filter(Boolean))]
        const scheduledMissing = scheduledIds.filter((performerId) => !requestedSet.has(performerId))
        if (scheduledMissing.length) {
          res.status(409).json({ error: '出演枠に登録済みのパフォーマーは外せません。先に対象の出演枠を確認してください。' })
          return
        }
        const currentRows = current ?? []
        const currentIds = new Set(currentRows.map((row) => String(row.performer_id)))
        const additions = requested.filter((performerId) => !currentIds.has(performerId))
        const removals = currentRows.map((row) => String(row.performer_id)).filter((performerId) => !requestedSet.has(performerId))
        if (additions.length) {
          const nextSort = currentRows.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), -1) + 1
          const { error } = await sb.from('event_lineup').insert(additions.map((performerId, index) => ({
            event_id: id,
            performer_id: performerId,
            sort_order: nextSort + index,
            is_voting_eligible: false,
          })))
          if (error) throw error
        }
        if (removals.length) {
          const { error } = await sb.from('event_lineup').delete().eq('event_id', id).in('performer_id', removals)
          if (error) {
            if (additions.length) await sb.from('event_lineup').delete().eq('event_id', id).in('performer_id', additions)
            throw error
          }
        }
        await audit(admin.id, 'event.lineup_set', id, { added: additions, removed: removals, selected_count: requested.length })
        res.status(200).json({ ok: true, added: additions.length, removed: removals.length })
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
        source: 'event_device_ballots',
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
      const [tipResult, orderResult, performerResult] = await Promise.all([
        sb.from('tips').select('id,performer_id,fan_id,status,gross_amount_yen,amount_cents,stripe_fee_yen,net_after_stripe_yen,haku_fee_bps,haku_fee_yen,performer_share_yen,platform_fee_yen,platform_fee_cents,refunded_amount_yen,dispute_status,settlement_status,created_at').order('created_at', { ascending: false }).limit(200),
        sb.from('merch_orders').select('id,seller_id,buyer_id,status,gross_amount_yen,amount_yen,stripe_fee_yen,net_after_stripe_yen,haku_fee_bps,haku_fee_yen,performer_share_yen,platform_fee_yen,refunded_amount_yen,dispute_status,settlement_status,product_name,created_at').order('created_at', { ascending: false }).limit(200),
        sb.from('performers').select('id,stage_name,is_approved,stripe_account_id,stripe_onboarding_complete').order('stage_name'),
      ])
      if (tipResult.error) throw tipResult.error
      if (orderResult.error) throw orderResult.error
      if (performerResult.error) throw performerResult.error
      const tips = tipResult.data
      const orders = orderResult.data
      const performerRows = performerResult.data
      const { data: payouts, error: payoutError } = await sb.from('performer_payouts').select('id,performer_id,amount_yen,status,stripe_payout_id,created_at,updated_at').order('created_at', { ascending: false }).limit(200)
      if (payoutError) throw payoutError
      const stripe = getStripe()
      const stripePerformers = await Promise.all((performerRows ?? []).map(async (performer) => {
        const accountId = performer.stripe_account_id as string | null
        if (!accountId) return {
          performer_id: performer.id, stage_name: performer.stage_name, approved: performer.is_approved,
          state: 'unregistered', charges_enabled: false, payouts_enabled: false, details_submitted: false,
          needs_information: false, under_review: false, tip_available: false, merch_available: false,
          confirmed_sales_yen: 0, available_yen: 0, paid_out_yen: 0, pending_payout_yen: 0,
          held_yen: 0,
        }
        try {
          const [account, payoutView] = await Promise.all([
            stripe.accounts.retrieve(accountId),
            getPerformerPayoutView(sb, stripe, { performerId: performer.id, stripeAccountId: accountId }),
          ])
          const ready = isConnectedAccountChargeReady(account)
          const needsInformation = Boolean(account.requirements?.currently_due?.length || account.requirements?.past_due?.length)
          const underReview = Boolean(account.requirements?.pending_verification?.length)
          const state = ready ? 'ready' : account.requirements?.disabled_reason ? 'restricted' : needsInformation ? 'needs_information' : underReview ? 'under_review' : 'onboarding'
          return {
            performer_id: performer.id, stage_name: performer.stage_name, approved: performer.is_approved,
            state, charges_enabled: Boolean(account.charges_enabled), payouts_enabled: Boolean(account.payouts_enabled), details_submitted: Boolean(account.details_submitted),
            needs_information: needsInformation, under_review: underReview,
            tip_available: Boolean(performer.is_approved && ready), merch_available: Boolean(performer.is_approved && ready),
            confirmed_sales_yen: payoutView.confirmedSalesYen, available_yen: payoutView.availableYen,
            paid_out_yen: payoutView.paidOutYen, pending_payout_yen: payoutView.pendingYen, held_yen: payoutView.heldYen,
          }
        } catch (error) {
          console.error('admin Stripe status check failed', performer.id, error)
          return {
            performer_id: performer.id, stage_name: performer.stage_name, approved: performer.is_approved,
            state: 'check_error', charges_enabled: false, payouts_enabled: false, details_submitted: Boolean(performer.stripe_onboarding_complete),
            needs_information: false, under_review: false, tip_available: false, merch_available: false,
            confirmed_sales_yen: 0, available_yen: 0, paid_out_yen: 0, pending_payout_yen: 0,
            held_yen: 0,
          }
        }
      }))
      res.status(200).json({
        ok: true,
        kind: 'recorded',
        rates: { tip_system_fee_bps: TIP_SYSTEM_FEE_BPS, merch_system_fee_bps: MERCH_SYSTEM_FEE_BPS },
        tips: (tips ?? []).map((row) => row.settlement_status === 'settled'
          ? { ...row, current_settlement: currentSettlement(row, TIP_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_cents']) }
          : row),
        orders: (orders ?? []).map((row) => row.settlement_status === 'settled'
          ? { ...row, current_settlement: currentSettlement(row, MERCH_SYSTEM_FEE_BPS, ['gross_amount_yen', 'amount_yen']) }
          : row),
        stripe_processing_fee: { available: true, source: 'Stripe BalanceTransaction' },
        payouts: payouts ?? [],
        stripePerformers,
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
      const { data } = await sb.from('platform_settings').select('key,value').eq('key', 'tip_min_amount_yen')
      res.status(200).json({
        ok: true,
        rows: [
          { key: 'tip_fee_bps', value: TIP_SYSTEM_FEE_BPS, source: 'server' },
          { key: 'merch_fee_bps', value: MERCH_SYSTEM_FEE_BPS, source: 'server' },
          ...(data ?? []),
        ],
      })
      return
    }

    res.status(404).json({ error: 'unknown resource' })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'admin failed' })
  }
}
