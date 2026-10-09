import { requireSupabase } from './supabase'
import { trackProductEvent } from './track'
import type {
  AdminMetrics,
  LiveComment,
  LiveSession,
  LiveTipEvent,
  MerchOrder,
  MerchProduct,
  NotificationRow,
  Performer,
  TipRow,
  TipSummary,
} from './types'
import { supabaseAuthHeaders } from './supabase'
import { AWP_ENTRANCE_ZONE } from './venueDisplay'
import { PERFORMER_CLIENT_SELECT } from './performerColumns'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS } from '../../../shared/fees'

export type PerformerSearchFilters = {
  liveOnly?: boolean
  genre?: string
  country?: string
  overseasOnly?: boolean
}

let lastPresenceReconcile = 0
export async function reconcileLivePresence() {
  if (Date.now() - lastPresenceReconcile < 20_000) return
  lastPresenceReconcile = Date.now()
  await fetch('/api/livekit/presence', { cache: 'no-store' }).catch(() => undefined)
}

function isPublicTestPerformer(p: Performer): boolean {
  return /^test performer$/i.test(p.stage_name.trim())
}

export async function searchPerformers(query: string, filters: PerformerSearchFilters = {}): Promise<Performer[]> {
  const sb = requireSupabase()
  let q = sb.from('performers').select(PERFORMER_CLIENT_SELECT).eq('is_approved', true)
  if (filters.liveOnly) q = q.eq('is_live', true)
  const { data, error } = await q.order('is_live', { ascending: false }).limit(100)
  if (error) throw error
  const rows = (data as Performer[]) ?? []
  const trimmed = query.trim().toLowerCase()
  const genre = filters.genre?.trim().toLowerCase()
  const country = filters.country?.trim().toLowerCase()
  const japanish = /^(japan|日本|jp|jpn|tokyo|東京)$/i
  return rows.filter((p) => {
    if (isPublicTestPerformer(p)) return false
    if (genre && !p.genre.toLowerCase().includes(genre)) return false
    if (country && !(p.country || '').toLowerCase().includes(country) && !(p.city || '').toLowerCase().includes(country)) return false
    if (filters.overseasOnly) {
      const loc = `${p.country} ${p.city}`.trim()
      if (!loc || japanish.test(p.country.trim()) || japanish.test(p.city.trim())) return false
    }
    if (!trimmed) return true
    const hay = [p.stage_name, p.genre, p.city, p.country, p.bio, p.awards ?? '', p.appearances ?? ''].join(' ').toLowerCase()
    const words = trimmed.split(/\s+/).filter(Boolean)
    return words.every((w) => hay.includes(w))
  })
}

export async function getPerformer(id: string, includePublicTest = false): Promise<Performer | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  const row = (data as Performer) ?? null
  if (!row || !row.is_approved || (!includePublicTest && isPublicTestPerformer(row))) return null
  return row
}

export async function listLivePerformers(): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('performers')
    .select(PERFORMER_CLIENT_SELECT)
    .eq('is_approved', true)
    .eq('is_live', true)
    .order('live_started_at', { ascending: false })
  if (error) throw error
  return ((data as Performer[]) ?? []).filter((p) => !isPublicTestPerformer(p))
}

export type LiveRankRow = {
  performer: Performer
  session: LiveSession | null
  tip_amount_total: number
  tip_count: number
  viewer_peak: number
}

type LiveSlotCandidate = { id: string; venue_id: string; date: string; start_time: string; end_time: string }

export function selectLiveEventSlot(rows: LiveSlotCandidate[], today: string, currentTime: string): LiveSlotCandidate | null {
  const sorted = [...rows].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  const todayRows = sorted.filter((slot) => String(slot.date).slice(0, 10) === today)
  return todayRows.find((slot) => String(slot.start_time).slice(0, 5) <= currentTime && currentTime < String(slot.end_time).slice(0, 5))
    ?? todayRows.find((slot) => String(slot.start_time).slice(0, 5) > currentTime)
    ?? todayRows[0]
    ?? sorted[0]
    ?? null
}

/** Currently-live ranking by tips, then viewer peak, then start time. */
export async function listLiveRanking(): Promise<LiveRankRow[]> {
  const live = await listLivePerformers()
  if (live.length === 0) return []
  const sb = requireSupabase()
  const ids = live.map((p) => p.id)
  const { data, error } = await sb
    .from('live_sessions')
    .select('*')
    .in('performer_id', ids)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
  if (error) throw error
  const sessions = (data as LiveSession[]) ?? []
  const latestByPerformer = new Map<string, LiveSession>()
  for (const s of sessions) {
    if (!latestByPerformer.has(s.performer_id)) latestByPerformer.set(s.performer_id, s)
  }
  const rows: LiveRankRow[] = live.map((performer) => {
    const session = latestByPerformer.get(performer.id) ?? null
    return {
      performer,
      session,
      tip_amount_total: session?.tip_amount_total ?? 0,
      tip_count: session?.tip_count ?? 0,
      viewer_peak: session?.viewer_peak ?? 0,
    }
  })
  rows.sort((a, b) => {
    if (b.tip_amount_total !== a.tip_amount_total) return b.tip_amount_total - a.tip_amount_total
    if (b.viewer_peak !== a.viewer_peak) return b.viewer_peak - a.viewer_peak
    const at = a.performer.live_started_at ? new Date(a.performer.live_started_at).getTime() : 0
    const bt = b.performer.live_started_at ? new Date(b.performer.live_started_at).getTime() : 0
    return bt - at
  })
  return rows
}

export async function updateLiveViewerPeak(performerId: string, viewers: number) {
  const peak = Math.max(0, Math.floor(viewers))
  if (peak <= 0) return
  const sb = requireSupabase()
  const { data: open } = await sb
    .from('live_sessions')
    .select('id, viewer_peak')
    .eq('performer_id', performerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!open?.id) return
  const current = open.viewer_peak ?? 0
  if (peak <= current) return
  await sb.from('live_sessions').update({ viewer_peak: peak }).eq('id', open.id)
}

async function assertApprovedActivePerformer(performerId: string) {
  const sb = requireSupabase()
  const [{ data: performer }, { data: profile }] = await Promise.all([
    sb.from('performers').select('is_approved').eq('id', performerId).maybeSingle(),
    sb.from('profiles').select('status').eq('id', performerId).maybeSingle(),
  ])
  if (!performer?.is_approved || profile?.status !== 'active') {
    throw new Error('運営の承認後にLIVEを開始できます。登録状況をご確認ください。')
  }
}

export async function updatePerformer(id: string, patch: Partial<Performer>) {
  if (patch.is_live === true) await assertApprovedActivePerformer(id)
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Performer update unavailable')
}

export async function startLive(performerId: string, title?: string) {
  await assertApprovedActivePerformer(performerId)
  const sb = requireSupabase()
  const now = new Date().toISOString()
  const liveTitle = title?.trim() || null

  const { data: existing } = await sb
    .from('live_sessions')
    .select('id')
    .eq('performer_id', performerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: performerRow } = await sb
    .from('performers')
    .select('is_live, stage_name, live_title')
    .eq('id', performerId)
    .maybeSingle()

  const alreadyLive = Boolean(performerRow?.is_live && existing?.id)

  const patch: Partial<Performer> & { stream_url: null } = {
    is_live: true,
    live_title: liveTitle ?? (performerRow?.live_title as string | null) ?? null,
    stream_url: null,
  }
  if (!alreadyLive) {
    patch.live_started_at = now
  }

  const { error: uerr } = await sb.from('performers').update(patch).eq('id', performerId)
  if (uerr) throw uerr

  if (alreadyLive && existing?.id) {
    if (liveTitle) {
      await sb.from('live_sessions').update({ title: liveTitle }).eq('id', existing.id)
    }
    return existing.id as string
  }

  if (existing?.id) {
    await sb.from('live_sessions').update({ ended_at: now }).eq('id', existing.id)
  }

  const featured = await getFeaturedEvent().catch(() => null)
  let venueId: string | null = null
  let eventSlotId: string | null = null
  if (featured) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
    const currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    const { data: slotRows } = await sb
      .from('event_slots')
      .select('id, venue_id, date, start_time, end_time')
      .eq('event_id', featured.id)
      .eq('performer_id', performerId)
    const match = selectLiveEventSlot((slotRows ?? []) as LiveSlotCandidate[], today, currentTime)
    venueId = (match?.venue_id as string | undefined) ?? ((slotRows ?? [])[0]?.venue_id as string | undefined) ?? null
    eventSlotId = (match?.id as string | undefined) ?? null
  }

  const baseInsert = {
    performer_id: performerId,
    stream_url: null as null,
    title: liveTitle,
    started_at: now,
  }
  const boundInsert = { ...baseInsert, event_id: featured?.id ?? null, venue_id: venueId }
  const slotBoundInsert = { ...boundInsert, event_slot_id: eventSlotId }

  let inserted = await sb.from('live_sessions').insert(slotBoundInsert).select('id').single()
  if (inserted.error) {
    inserted = await sb.from('live_sessions').insert(boundInsert).select('id').single()
  }
  if (inserted.error) {
    inserted = await sb.from('live_sessions').insert(baseInsert).select('id').single()
  }
  if (inserted.error) throw inserted.error

  const stageName = (performerRow?.stage_name as string) || 'パフォーマー'
  const { error: nerr } = await sb.rpc('notify_followers_live_start', {
    p_performer_id: performerId,
    p_stage_name: stageName,
    p_title: liveTitle,
  })
  if (nerr) {
    console.warn('notify_followers_live_start', nerr.message)
  }

  return (inserted.data?.id as string) ?? null
}

export async function endLive(performerId: string) {
  const sb = requireSupabase()
  const now = new Date().toISOString()
  const { error: uerr } = await sb
    .from('performers')
    .update({
      is_live: false,
      share_location: false,
      live_started_at: null,
      live_title: null,
      lat: null,
      lng: null,
      location_updated_at: null,
    })
    .eq('id', performerId)
  if (uerr) throw uerr
  // Close every open session (guards against duplicates from older builds).
  await sb
    .from('live_sessions')
    .update({ ended_at: now })
    .eq('performer_id', performerId)
    .is('ended_at', null)
}

export async function listEventLiveSessions(eventId: string): Promise<LiveSession[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('live_sessions')
    .select('*')
    .eq('event_id', eventId)
    .order('started_at', { ascending: false })
    .limit(40)
  if (error) return []
  return (data as LiveSession[]) ?? []
}

export async function listLiveHistory(performerId: string): Promise<LiveSession[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('live_sessions')
    .select('*')
    .eq('performer_id', performerId)
    .order('started_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data as LiveSession[]) ?? []
}

export async function listLiveComments(performerId: string): Promise<LiveComment[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('live_comments')
    .select('*')
    .eq('performer_id', performerId)
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) throw error
  return ((data as LiveComment[]) ?? []).reverse()
}

export async function postLiveComment(input: {
  performerId: string
  userId: string
  displayName: string
  body: string
  liveSessionId?: string | null
}) {
  const sb = requireSupabase()
  const text = input.body.trim().slice(0, 200)
  if (!text) throw new Error('Comment is empty')
  const { error } = await sb.from('live_comments').insert({
    performer_id: input.performerId,
    user_id: input.userId,
    display_name: input.displayName || 'Fan',
    body: text,
    live_session_id: input.liveSessionId ?? null,
  })
  if (error) throw error
}

export function subscribeLiveComments(performerId: string, onInsert: (row: LiveComment) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`live-comments-${performerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `performer_id=eq.${performerId}` },
      (payload) => {
        onInsert(payload.new as LiveComment)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

export function subscribePerformerLive(performerId: string, onChange: (row: Partial<Performer>) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`performer-live-${performerId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'performers', filter: `id=eq.${performerId}` },
      (payload) => {
        onChange(payload.new as Performer)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

export function subscribePerformerMapUpdates(onChange: (row: Performer) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel('performer-map-updates')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'performers' },
      (payload) => {
        onChange(payload.new as Performer)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

export function subscribeLiveTipEvents(performerId: string, onInsert: (row: LiveTipEvent) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`live-tips-${performerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_tip_events', filter: `performer_id=eq.${performerId}` },
      (payload) => {
        onInsert(payload.new as LiveTipEvent)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

export async function listRecentLiveTipEvents(performerId: string, limit = 20): Promise<LiveTipEvent[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('live_tip_events')
    .select('*')
    .eq('performer_id', performerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data as LiveTipEvent[]) ?? []).reverse()
}

export async function listTipsForPerformer(performerId: string): Promise<TipRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('tips')
    .select('*')
    .eq('performer_id', performerId)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data as TipRow[]) ?? []
}

export async function listPerformerTipTransactions(performerId: string): Promise<TipRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('tips')
    .select('*')
    .eq('performer_id', performerId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as TipRow[]) ?? []
}

export async function tipSummaryForPerformer(performerId: string): Promise<TipSummary> {
  const tips = await listTipsForPerformer(performerId)
  return {
    count: tips.length,
    amount_total: tips.reduce((sum, t) => sum + (t.amount_cents || 0), 0),
    fee_total: tips.reduce((sum, t) => sum + (t.settlement_status === 'settled' ? (t.haku_fee_yen || 0) : 0), 0),
  }
}

export async function sumLiveViews(performerId: string): Promise<number> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('live_sessions').select('viewer_peak').eq('performer_id', performerId)
  if (error) return 0
  return (data ?? []).reduce((sum, row) => sum + (Number((row as { viewer_peak?: number }).viewer_peak) || 0), 0)
}

export async function isFollowing(fanId: string, performerId: string): Promise<boolean> {
  const sb = requireSupabase()
  const { data } = await sb
    .from('follows')
    .select('fan_id')
    .eq('fan_id', fanId)
    .eq('performer_id', performerId)
    .maybeSingle()
  return Boolean(data)
}

export async function countFollowers(performerId: string): Promise<number> {
  const sb = requireSupabase()
  const { count, error } = await sb
    .from('follows')
    .select('fan_id', { count: 'exact', head: true })
    .eq('performer_id', performerId)
  if (error) return 0
  return count ?? 0
}

export async function follow(fanId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('follows').insert({ fan_id: fanId, performer_id: performerId })
  if (error && error.code !== '23505') throw error
  if (!error) trackProductEvent('follow_complete', { performerId })
}

export async function listFollowedPerformers(fanId: string): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data: follows, error } = await sb.from('follows').select('performer_id').eq('fan_id', fanId)
  if (error) throw error
  const ids = (follows ?? []).map((f) => f.performer_id as string)
  if (ids.length === 0) return []
  const { data, error: perr } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', ids).eq('is_approved', true)
  if (perr) throw perr
  return (data as Performer[]) ?? []
}

export async function unfollow(fanId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('follows').delete().eq('fan_id', fanId).eq('performer_id', performerId)
  if (error) throw error
}

export async function listNotifications(userId: string): Promise<NotificationRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data as NotificationRow[]) ?? []
}

export async function markNotificationRead(id: string) {
  const sb = requireSupabase()
  await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
}

export async function fetchAdminMetrics(): Promise<AdminMetrics | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('get_admin_metrics')
  if (error) throw error
  return (data as AdminMetrics) ?? null
}

export async function listPendingPerformers(): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).eq('is_approved', false).order('created_at')
  if (error) throw error
  return (data as Performer[]) ?? []
}

export type PerformerRegistration = Performer & { account_status: string }

export async function listPerformerRegistrations(): Promise<PerformerRegistration[]> {
  const sb = requireSupabase()
  const [{ data: performers, error }, { data: profiles, error: profileError }] = await Promise.all([
    sb.from('performers').select(PERFORMER_CLIENT_SELECT).order('created_at', { ascending: false }),
    sb.from('profiles').select('id,status').in('role', ['performer', 'admin']),
  ])
  if (error) throw error
  if (profileError) throw profileError
  const statuses = new Map((profiles ?? []).map((p) => [p.id, p.status]))
  return (performers ?? []).map((p) => ({ ...p, account_status: statuses.get(p.id) ?? 'unknown' })) as PerformerRegistration[]
}

export async function approvePerformer(id: string) {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('performers')
    .update({ is_approved: true })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Approve failed: performer row not updated (check RLS/grants)')

  const { error: perr } = await sb.from('profiles').update({ status: 'active' }).eq('id', id)
  if (perr) {
    const { error: rollbackError } = await sb
      .from('performers')
      .update({ is_approved: false, is_live: false, share_location: false })
      .eq('id', id)
    if (rollbackError) throw new Error('Approval could not be completed or safely rolled back')
    throw perr
  }
}

export async function unpublishPerformer(id: string) {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('performers')
    .update({
      is_approved: false,
      is_live: false,
      share_location: false,
      live_started_at: null,
      live_title: null,
      lat: null,
      lng: null,
      location_updated_at: null,
    })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Unpublish failed: performer row not updated (check RLS/grants)')

  const { error: sessionError } = await sb
    .from('live_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('performer_id', id)
    .is('ended_at', null)
  if (sessionError) throw sessionError
}

export async function suspendUser(id: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('profiles').update({ status: 'suspended' }).eq('id', id)
  if (error) throw error
  const { error: perr } = await sb.from('performers').update({ is_live: false, is_approved: false }).eq('id', id)
  if (perr) throw perr
}

export async function softDeleteUser(id: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('profiles').update({ status: 'deleted', display_name: 'Deleted' }).eq('id', id)
  if (error) throw error
  const { error: perr } = await sb.from('performers').update({ is_live: false, is_approved: false, stage_name: 'Deleted' }).eq('id', id)
  if (perr) throw perr
}

export async function listUsers() {
  const sb = requireSupabase()
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const sb = requireSupabase()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user || auth.user.id !== userId) throw new Error('自分の写真だけ変更できます')
  const path = `${userId}/${Date.now()}.${validatedImageExt(file)}`
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = sb.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function updateOwnAvatar(userId: string, file: File): Promise<string> {
  const url = await uploadAvatar(userId, file)
  const { error } = await requireSupabase().from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (error) throw error
  return url
}

function validatedImageExt(file: File): string {
  const maxBytes = 5 * 1024 * 1024
  const allowedTypes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  const ext = allowedTypes[file.type]
  if (!ext) throw new Error('JPEG, PNG, WebP, GIF のみアップロードできます')
  if (file.size > maxBytes) throw new Error('画像は5MB以下にしてください')
  return ext
}

export async function uploadMerchImage(sellerId: string, file: File): Promise<string> {
  const sb = requireSupabase()
  const path = `${sellerId}/${Date.now()}.${validatedImageExt(file)}`
  const { error } = await sb.storage.from('merch').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = sb.storage.from('merch').getPublicUrl(path)
  return data.publicUrl
}

export async function isOshi(fanId: string, performerId: string): Promise<boolean> {
  const sb = requireSupabase()
  const { data } = await sb.from('oshi').select('fan_id').eq('fan_id', fanId).eq('performer_id', performerId).maybeSingle()
  return Boolean(data)
}

export async function addOshi(fanId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('oshi').upsert({ fan_id: fanId, performer_id: performerId })
  if (error) throw error
}

export async function removeOshi(fanId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('oshi').delete().eq('fan_id', fanId).eq('performer_id', performerId)
  if (error) throw error
}

export async function listOshiPerformers(fanId: string): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data: rows, error } = await sb.from('oshi').select('performer_id').eq('fan_id', fanId)
  if (error) throw error
  const ids = (rows ?? []).map((r) => r.performer_id as string)
  if (ids.length === 0) return []
  const { data, error: perr } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', ids).eq('is_approved', true)
  if (perr) throw perr
  return (data as Performer[]) ?? []
}

export type FeaturedEvent = {
  id: string
  slug: string
  name_ja: string
  name_en: string
  presenter_ja: string
  presenter_en: string
  date_label: string
  place_label: string
  hours_label: string
  official_url: string
  weather_note_ja: string
  weather_note_en?: string
  starts_on?: string | null
  ends_on?: string | null
  status?: 'draft' | 'published' | 'archived'
  is_featured?: boolean
  hero_kicker_ja?: string
  main_copy_ja?: string
  sub_copy_ja?: string
  admission_label?: string
  guide_enabled?: boolean
  results_published_at?: string | null
}

export type EventVoteRule = {
  event_id: string
  voting_enabled?: boolean
  voting_open: boolean
  votes_per_user_per_day: number
  votes_per_device?: number
  votes_per_voter?: number
  allow_anonymous?: boolean
  voting_starts_at: string | null
  voting_ends_at: string | null
  updated_at: string
}

export async function getFeaturedEvent(): Promise<FeaturedEvent | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('events')
    .select('*')
    .eq('is_featured', true)
    .eq('status', 'published')
    .limit(1)
  if (error) throw error
  return ((data?.[0] as FeaturedEvent | undefined) ?? null)
}

export async function listPublishedEvents(): Promise<FeaturedEvent[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('events').select('*').in('status', ['published', 'archived']).order('starts_on', { ascending: false })
  if (error) throw error
  return (data as FeaturedEvent[]) ?? []
}

export async function listManagedEvents(): Promise<FeaturedEvent[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('events').select('*').order('starts_on', { ascending: false })
  if (error) throw error
  return (data as FeaturedEvent[]) ?? []
}

export type OfficialNavigator = {
  event_id: string
  event_date: string
  performer_id: string
  show_on_home: boolean
  performer: Performer
  live_status: 'preparing' | 'live' | 'ended'
}

async function navigatorLiveStatus(performer: Performer, eventDate: string): Promise<OfficialNavigator['live_status']> {
  if (performer.is_live) return 'live'
  const sb = requireSupabase()
  const dayStart = `${eventDate}T00:00:00+09:00`
  const next = new Date(`${eventDate}T00:00:00+09:00`)
  next.setUTCDate(next.getUTCDate() + 1)
  const { data } = await sb.from('live_sessions').select('id').eq('performer_id', performer.id).gte('started_at', dayStart).lt('started_at', next.toISOString()).not('ended_at', 'is', null).limit(1)
  return data?.length ? 'ended' : 'preparing'
}

export async function getTodayOfficialNavigator(eventId: string): Promise<OfficialNavigator | null> {
  const sb = requireSupabase()
  const todayJst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const { data, error } = await sb
    .from('event_official_navigators')
    .select('event_id,event_date,performer_id,show_on_home')
    .eq('event_id', eventId)
    .eq('event_date', todayJst)
    .eq('show_on_home', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const performer = await getPerformer(data.performer_id)
  if (!performer) return null
  return { ...data, performer, live_status: await navigatorLiveStatus(performer, data.event_date) } as OfficialNavigator
}

export async function listOfficialNavigators(eventId: string): Promise<OfficialNavigator[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('event_official_navigators')
    .select('event_id,event_date,performer_id,show_on_home')
    .eq('event_id', eventId)
    .order('event_date')
  if (error) throw error
  const rows = await Promise.all((data ?? []).map(async (row) => {
    const performer = await getPerformer(row.performer_id)
    return performer ? { ...row, performer, live_status: await navigatorLiveStatus(performer, row.event_date) } as OfficialNavigator : null
  }))
  return rows.filter((row): row is OfficialNavigator => row !== null)
}

export async function saveOfficialNavigator(eventId: string, eventDate: string, performerId: string, showOnHome: boolean) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_official_navigators').upsert({
    event_id: eventId,
    event_date: eventDate,
    performer_id: performerId,
    show_on_home: showOnHome,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id,event_date' })
  if (error) throw error
}

export async function removeOfficialNavigator(eventId: string, eventDate: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_official_navigators').delete().eq('event_id', eventId).eq('event_date', eventDate)
  if (error) throw error
}

export async function getEventBySlug(slug: string): Promise<FeaturedEvent | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('events').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return (data as FeaturedEvent) ?? null
}

export async function createEvent(input: Pick<FeaturedEvent, 'slug' | 'name_ja' | 'name_en'>): Promise<FeaturedEvent> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('events').insert({ ...input, status: 'draft', is_featured: false }).select('*').single()
  if (error) throw error
  return data as FeaturedEvent
}

export async function saveFeaturedEventPatch(id: string, patch: Partial<FeaturedEvent>) {
  const sb = requireSupabase()
  const { error } = await sb.from('events').update(patch).eq('id', id)
  if (error) throw error
}

export async function getEventVoteRule(eventId: string): Promise<EventVoteRule | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_vote_rules').select('*').eq('event_id', eventId).maybeSingle()
  if (error) throw error
  return (data as EventVoteRule) ?? null
}

export async function saveEventVoteRule(eventId: string, patch: Partial<EventVoteRule>) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_vote_rules').upsert({ event_id: eventId, ...patch, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function getTipFeeBps(): Promise<number> {
  return TIP_SYSTEM_FEE_BPS
}

export async function getMerchFeeBps(): Promise<number> {
  return MERCH_SYSTEM_FEE_BPS
}

export type PerformerPayoutView = {
  minPayoutYen: number
  confirmedSalesYen: number
  hakuAvailableYen: number
  stripeAvailableYen: number
  availableYen: number
  heldYen: number
  pendingYen: number
  paidOutYen: number
  remainingYen: number
  canPayout: boolean
  ledgerReady: boolean
  openPayout: { id: string; amount_yen: number; status: string } | null
}

async function connectAction(performerId: string, action: 'earnings' | 'payout') {
  const response = await fetch('/api/stripe/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ performerId, action }),
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Connect unavailable')
  }
  return body
}

export async function fetchPerformerPayoutView(performerId: string): Promise<PerformerPayoutView> {
  return connectAction(performerId, 'earnings') as Promise<PerformerPayoutView>
}

export async function requestPerformerPayout(performerId: string) {
  return connectAction(performerId, 'payout')
}

export async function voteForPerformer(eventId: string, performerId: string, _fanId: string) {
  await castAnonEventVote(eventId, performerId)
  trackProductEvent('vote_complete', { performerId, eventId })
}

export type AnonVoteState = {
  voting_open: boolean
  max_votes: number
  used: number
  remaining: number
  voted: string[]
}

export async function getAnonVoteState(eventId: string, _legacyVoterId = ''): Promise<AnonVoteState> {
  const response = await fetch(`/api/votes/device?eventId=${encodeURIComponent(eventId)}`, { credentials: 'same-origin' })
  const row = await response.json().catch(() => ({})) as Partial<AnonVoteState> & { error?: string }
  if (!response.ok) throw new Error(row.error || 'vote_service_unavailable')
  const voted = Array.isArray(row.voted) ? row.voted.map(String) : []
  return {
    voting_open: Boolean(row.voting_open),
    max_votes: Number(row.max_votes) || 3,
    used: Number(row.used) || voted.length,
    remaining: Number(row.remaining) || 0,
    voted,
  }
}

export async function castAnonEventVote(eventId: string, performerId: string, _legacyVoterId = '') {
  const response = await fetch('/api/votes/device', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, performerId }),
  })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error || 'vote_failed')
  trackProductEvent('vote_complete', { performerId, eventId, props: { mode: 'anon' } })
}

export type AdminVoteDesk = {
  voting_open: boolean
  allow_anonymous: boolean
  votes_per_voter: number
  total_votes: number
  unique_voters: number
  ranking: Array<{ performer_id: string; votes: number }>
  hourly: Array<{ hour: string; votes: number }>
  anomalies: Array<{ voter_prefix: string; votes: number; span_seconds: number; kind: string }>
}

export async function getAdminVoteDesk(eventId: string): Promise<AdminVoteDesk> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('admin_event_vote_desk', { p_event_id: eventId })
  if (error) throw error
  const row = (data ?? {}) as Partial<AdminVoteDesk>
  return {
    voting_open: Boolean(row.voting_open),
    allow_anonymous: Boolean(row.allow_anonymous),
    votes_per_voter: Number(row.votes_per_voter) || 3,
    total_votes: Number(row.total_votes) || 0,
    unique_voters: Number(row.unique_voters) || 0,
    ranking: Array.isArray(row.ranking) ? row.ranking.map((item) => ({ performer_id: String(item.performer_id), votes: Number(item.votes) || 0 })) : [],
    hourly: Array.isArray(row.hourly) ? row.hourly.map((item) => ({ hour: String(item.hour), votes: Number(item.votes) || 0 })) : [],
    anomalies: Array.isArray(row.anomalies) ? row.anomalies : [],
  }
}

export async function getMyVote(eventId: string, fanId: string): Promise<string | null> {
  const votes = await getMyVotes(eventId, fanId)
  return votes[0] ?? null
}

export async function getMyVotes(eventId: string, fanId: string): Promise<string[]> {
  const sb = requireSupabase()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const { data } = await sb.from('event_ballots').select('performer_id').eq('event_id', eventId).eq('fan_id', fanId).eq('vote_date', today).order('created_at', { ascending: false }).limit(10)
  return (data ?? []).map((row) => row.performer_id as string)
}

export async function listVoteRanking(eventId: string): Promise<Array<{ performer_id: string; votes: number }>> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('get_public_event_results', { p_event_id: eventId })
  if (error) throw error
  return ((data ?? []) as Array<{ performer_id: string; votes: number | string }>).map((row) => ({ performer_id: row.performer_id, votes: Number(row.votes) || 0 }))
}

export async function listAdminVoteRanking(eventId: string): Promise<Array<{ performer_id: string; votes: number }>> {
  try {
    const desk = await getAdminVoteDesk(eventId)
    return desk.ranking
  } catch {
    const sb = requireSupabase()
    const { data, error } = await sb.from('event_ballots').select('performer_id').eq('event_id', eventId)
    if (error) throw error
    const counts = new Map<string, number>()
    for (const row of data ?? []) counts.set(row.performer_id as string, (counts.get(row.performer_id as string) ?? 0) + 1)
    return [...counts].map(([performer_id, votes]) => ({ performer_id, votes })).sort((a, b) => b.votes - a.votes)
  }
}

export async function createBookingInquiry(organizerId: string, performerId: string, message: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('booking_inquiries').insert({
    organizer_id: organizerId,
    performer_id: performerId,
    message: message.trim().slice(0, 2000),
  })
  if (error) throw error
}

export async function createReport(reporterId: string, targetType: string, targetId: string, reason: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('reports').insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason: reason.trim().slice(0, 500),
  })
  if (error) throw error
}

export async function listOpenReports() {
  const sb = requireSupabase()
  const { data, error } = await sb.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data ?? []
}

export type EventVenueRow = {
  id: string
  event_id: string
  name_ja: string
  name_en: string
  blurb_ja: string
  blurb_en: string
  lat: number | null
  lng: number | null
  sort_order: number
  venue_type?: 'stage' | 'statue' | 'roving' | 'food' | 'other'
}

export type EventSlotRow = {
  id: string
  event_id: string
  venue_id: string
  performer_id: string | null
  performer_name_ja?: string | null
  source_key?: string | null
  source_label?: string | null
  date: string
  start_time: string
  end_time: string
  stage_ja: string
  stage_en: string
  status: string
  note_ja: string
  note_en: string
  is_stream?: boolean
  performance_type?: 'regular' | 'special_final'
  round_no?: number | null
  ranking_position?: number | null
}

export type EventGuestAppearanceRow = {
  id: string
  event_id: string
  official_name_ja: string
  appearance_type: 'stage' | 'statue' | 'roving' | 'statue_roving'
  appearance_date: string
  linked_performer_id: string | null
  source_key: string
  source_label: string
  sort_order: number
}

export type PerformerEventSlot = EventSlotRow & {
  events: { name_ja: string; slug: string } | null
  event_venues: { name_ja: string } | null
}

export async function listPerformerEventSlots(performerId: string): Promise<PerformerEventSlot[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('event_slots')
    .select('*,events(name_ja,slug),event_venues(name_ja)')
    .eq('performer_id', performerId)
    .order('date')
    .order('start_time')
  if (error) throw error
  return (data as PerformerEventSlot[]) ?? []
}

export async function listApprovedPerformers(includePublicTest = false): Promise<Performer[]> {
  await reconcileLivePresence()
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).eq('is_approved', true).order('stage_name')
  if (error) throw error
  return ((data as Performer[]) ?? []).filter((p) => includePublicTest || !isPublicTestPerformer(p))
}

function resolveEventVenue(row: EventVenueRow): EventVenueRow {
  if (row.id !== 'nerima-joshi-park') return row
  return {
    ...row,
    name_ja: AWP_ENTRANCE_ZONE.name_ja,
    blurb_ja: AWP_ENTRANCE_ZONE.zone_ja,
    blurb_en: 'Entrance Exchange Zone',
    lat: AWP_ENTRANCE_ZONE.lat,
    lng: AWP_ENTRANCE_ZONE.lng,
  }
}

export async function listEventVenues(eventId: string): Promise<EventVenueRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_venues').select('*').eq('event_id', eventId).order('sort_order')
  if (error) throw error
  return ((data as EventVenueRow[]) ?? []).map(resolveEventVenue)
}

export async function upsertEventVenue(row: EventVenueRow) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_venues').upsert(row)
  if (error) throw error
}

export async function deleteEventVenue(id: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_venues').delete().eq('id', id)
  if (error) throw error
}

export async function listEventSlots(eventId: string): Promise<EventSlotRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('event_slots')
    .select('*')
    .eq('event_id', eventId)
    .order('date')
    .order('start_time')
  if (error) throw error
  return (data as EventSlotRow[]) ?? []
}

export async function listEventGuestAppearances(eventId: string): Promise<EventGuestAppearanceRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('event_guest_appearances')
    .select('id,event_id,official_name_ja,appearance_type,appearance_date,linked_performer_id,source_key,source_label,sort_order')
    .eq('event_id', eventId)
    .order('appearance_date')
    .order('sort_order')
  if (error) throw error
  return (data as EventGuestAppearanceRow[]) ?? []
}

/** Approved HAKU profiles by id. Used for official guest cards that are not on the voting lineup. */
export async function listApprovedPerformersByIds(ids: string[]): Promise<Performer[]> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
  if (unique.length === 0) return []
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', unique).eq('is_approved', true)
  if (error) throw error
  return ((data as Performer[]) ?? []).filter((performer) => !isPublicTestPerformer(performer))
}

export async function upsertEventSlot(row: Omit<EventSlotRow, 'id'> & { id?: string }) {
  const sb = requireSupabase()
  const run = async (payload: typeof row) => {
    if (payload.id) {
      const { error } = await sb.from('event_slots').update(payload).eq('id', payload.id)
      if (error) throw error
      return
    }
    const { id: _id, ...insertRow } = payload
    const { error } = await sb.from('event_slots').insert(insertRow)
    if (error) throw error
  }
  try {
    await run(row)
  } catch (e) {
    if (row.is_stream == null) throw e
    const { is_stream: _s, ...rest } = row
    await run(rest)
  }
}

export async function deleteEventSlot(id: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_slots').delete().eq('id', id)
  if (error) throw error
}

export async function listEventLineup(eventId: string): Promise<string[]> {
  const rows = await listEventLineupRows(eventId)
  return rows.map((row) => row.performer_id)
}

export type EventLineupRow = {
  performer_id: string
  sort_order: number
  is_voting_eligible: boolean
}

export async function listEventLineupRows(eventId: string): Promise<EventLineupRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_lineup').select('performer_id,sort_order,is_voting_eligible').eq('event_id', eventId).order('sort_order')
  if (error) throw error
  return (data ?? []).map((row) => ({
    performer_id: String(row.performer_id),
    sort_order: Number(row.sort_order) || 0,
    is_voting_eligible: row.is_voting_eligible !== false,
  }))
}

export async function listEventLineupPerformers(eventId: string): Promise<Performer[]> {
  const ids = await listEventLineup(eventId)
  if (ids.length === 0) return []
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', ids).eq('is_approved', true)
  if (error) throw error
  const byId = new Map(((data as Performer[]) ?? []).map((performer) => [performer.id, performer]))
  return ids.map((id) => byId.get(id)).filter((performer): performer is Performer => Boolean(performer))
}

export async function listVotingEligibleEventLineupPerformers(eventId: string): Promise<Performer[]> {
  const rows = await listEventLineupRows(eventId)
  const ids = rows.filter((row) => row.is_voting_eligible).map((row) => row.performer_id)
  if (ids.length === 0) return []
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', ids).eq('is_approved', true)
  if (error) throw error
  const byId = new Map(((data as Performer[]) ?? []).map((performer) => [performer.id, performer]))
  return ids.map((id) => byId.get(id)).filter((performer): performer is Performer => Boolean(performer))
}

export async function addEventLineup(eventId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_lineup').upsert({ event_id: eventId, performer_id: performerId, sort_order: 0, is_voting_eligible: false }, { onConflict: 'event_id,performer_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function setEventLineupVotingEligibility(eventId: string, performerId: string, eligible: boolean) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_lineup').update({ is_voting_eligible: eligible }).eq('event_id', eventId).eq('performer_id', performerId)
  if (error) throw error
}

export async function clearEventVotingEligibility(eventId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_lineup').update({ is_voting_eligible: false }).eq('event_id', eventId)
  if (error) throw error
}

export async function removeEventLineup(eventId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_lineup').delete().eq('event_id', eventId).eq('performer_id', performerId)
  if (error) throw error
}

export async function notifyEventAppearances(eventId: string) {
  const sb = requireSupabase()
  const { error } = await sb.rpc('notify_event_appearances', { p_event_id: eventId })
  if (error) throw error
}

export async function listVoteRankingNamed(eventId: string): Promise<Array<{ performer: Performer; votes: number }>> {
  const ranks = await listVoteRanking(eventId)
  if (ranks.length === 0) return []
  const sb = requireSupabase()
  const ids = ranks.map((r) => r.performer_id)
  const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT).in('id', ids)
  if (error) throw error
  const map = new Map(((data as Performer[]) ?? []).map((p) => [p.id, p]))
  return ranks
    .map((r) => {
      const performer = map.get(r.performer_id)
      return performer ? { performer, votes: r.votes } : null
    })
    .filter((x): x is { performer: Performer; votes: number } => Boolean(x))
}

export async function listActiveMerchProducts(): Promise<MerchProduct[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('merch_products')
    .select('*')
    .in('status', ['active', 'sold_out'])
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as MerchProduct[]) ?? []
}

export async function getMerchProduct(id: string): Promise<MerchProduct | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('merch_products').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as MerchProduct) ?? null
}

export async function listSellerMerchProducts(sellerId: string): Promise<MerchProduct[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('merch_products')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as MerchProduct[]) ?? []
}

export async function saveSellerMerchProduct(
  sellerId: string,
  input: {
    id?: string
    name: string
    description: string
    image_url: string | null
    price_yen: number
    stock: number
    status: MerchProduct['status']
  },
) {
  const sb = requireSupabase()
  const payload = {
    seller_id: sellerId,
    name: input.name.trim().slice(0, 120),
    description: input.description.trim().slice(0, 2000),
    image_url: input.image_url,
    price_yen: Math.max(100, Math.min(1000000, Math.floor(input.price_yen) || 100)),
    stock: Math.max(0, Math.min(9999, Math.floor(input.stock) || 0)),
    status: input.status,
  }
  const query = input.id
    ? sb.from('merch_products').update(payload).eq('id', input.id).eq('seller_id', sellerId)
    : sb.from('merch_products').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function listMyMerchOrders(buyerId: string): Promise<MerchOrder[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('merch_orders')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data as MerchOrder[]) ?? []
}

export async function listSellerMerchOrders(sellerId: string): Promise<MerchOrder[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('merch_orders')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as MerchOrder[]) ?? []
}

export async function createMerchCheckout(productId: string, quantity: number, requestId: string): Promise<string> {
  const res = await fetch('/api/stripe/merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ productId, quantity, requestId }),
  })
  const json = (await res.json()) as { url?: string; code?: string }
  if (!res.ok || !json.url) throw new Error(json.code || 'checkout_failed')
  return json.url
}
