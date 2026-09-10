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

export type PerformerSearchFilters = {
  liveOnly?: boolean
  genre?: string
  country?: string
  overseasOnly?: boolean
}

export async function searchPerformers(query: string, filters: PerformerSearchFilters = {}): Promise<Performer[]> {
  const sb = requireSupabase()
  let q = sb.from('performers').select('*').eq('is_approved', true)
  if (filters.liveOnly) q = q.eq('is_live', true)
  const { data, error } = await q.order('is_live', { ascending: false }).limit(100)
  if (error) throw error
  const rows = (data as Performer[]) ?? []
  const trimmed = query.trim().toLowerCase()
  const genre = filters.genre?.trim().toLowerCase()
  const country = filters.country?.trim().toLowerCase()
  const japanish = /^(japan|日本|jp|jpn|tokyo|東京)$/i
  return rows.filter((p) => {
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

export async function getPerformer(id: string): Promise<Performer | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Performer) ?? null
}

export async function listLivePerformers(): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('performers')
    .select('*')
    .eq('is_approved', true)
    .eq('is_live', true)
    .order('live_started_at', { ascending: false })
  if (error) throw error
  return (data as Performer[]) ?? []
}

export type LiveRankRow = {
  performer: Performer
  session: LiveSession | null
  tip_amount_total: number
  tip_count: number
  viewer_peak: number
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

export async function updatePerformer(id: string, patch: Partial<Performer>) {
  const sb = requireSupabase()
  const { error } = await sb.from('performers').update(patch).eq('id', id)
  if (error) throw error
}

export async function startLive(performerId: string, title?: string) {
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
  if (featured) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
    const { data: slotRows } = await sb
      .from('event_slots')
      .select('venue_id, date, start_time, end_time')
      .eq('event_id', featured.id)
      .eq('performer_id', performerId)
    const match = (slotRows ?? []).find((s) => String(s.date).slice(0, 10) === today)
    venueId = (match?.venue_id as string | undefined) ?? ((slotRows ?? [])[0]?.venue_id as string | undefined) ?? null
  }

  const baseInsert = {
    performer_id: performerId,
    stream_url: null as null,
    title: liveTitle,
    started_at: now,
  }
  const boundInsert = { ...baseInsert, event_id: featured?.id ?? null, venue_id: venueId }

  let inserted = await sb.from('live_sessions').insert(boundInsert).select('id').single()
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
    .update({ is_live: false, live_started_at: null, live_title: null })
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

export async function tipSummaryForPerformer(performerId: string): Promise<TipSummary> {
  const tips = await listTipsForPerformer(performerId)
  return {
    count: tips.length,
    amount_total: tips.reduce((sum, t) => sum + (t.amount_cents || 0), 0),
    fee_total: tips.reduce((sum, t) => sum + (t.platform_fee_cents || 0), 0),
  }
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
  const { data, error: perr } = await sb.from('performers').select('*').in('id', ids).eq('is_approved', true)
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
  const { data, error } = await sb.from('performers').select('*').eq('is_approved', false).order('created_at')
  if (error) throw error
  return (data as Performer[]) ?? []
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
  if (perr) throw perr
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
  const path = `${userId}/${Date.now()}.${validatedImageExt(file)}`
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = sb.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
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
  const { data, error: perr } = await sb.from('performers').select('*').in('id', ids).eq('is_approved', true)
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
  starts_on?: string | null
  ends_on?: string | null
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

export async function saveFeaturedEventPatch(id: string, patch: Partial<FeaturedEvent>) {
  const sb = requireSupabase()
  const { error } = await sb.from('events').update(patch).eq('id', id)
  if (error) throw error
}

export async function getTipFeeBps(): Promise<number> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('platform_settings').select('value').eq('key', 'tip_fee_bps').maybeSingle()
  if (error || data?.value == null) return 1000
  const n = Number(data.value)
  if (!Number.isFinite(n) || n < 0 || n > 5000) return 1000
  return Math.floor(n)
}

export async function setTipFeeBps(bps: number) {
  const sb = requireSupabase()
  const value = Math.max(0, Math.min(5000, Math.floor(bps)))
  const { error } = await sb.from('platform_settings').upsert({ key: 'tip_fee_bps', value, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function voteForPerformer(eventId: string, performerId: string, fanId: string) {
  const sb = requireSupabase()
  await sb.from('event_votes').delete().eq('event_id', eventId).eq('fan_id', fanId)
  const { error } = await sb.from('event_votes').insert({ event_id: eventId, performer_id: performerId, fan_id: fanId })
  if (error) throw error
  trackProductEvent('vote_complete', { performerId, eventId })
}

export async function getMyVote(eventId: string, fanId: string): Promise<string | null> {
  const sb = requireSupabase()
  const { data } = await sb.from('event_votes').select('performer_id').eq('event_id', eventId).eq('fan_id', fanId).maybeSingle()
  return (data?.performer_id as string) ?? null
}

export async function listVoteRanking(eventId: string): Promise<Array<{ performer_id: string; votes: number }>> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_votes').select('performer_id').eq('event_id', eventId)
  if (error) throw error
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const id = row.performer_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([performer_id, votes]) => ({ performer_id, votes }))
    .sort((a, b) => b.votes - a.votes)
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
}

export type EventSlotRow = {
  id: string
  event_id: string
  venue_id: string
  performer_id: string | null
  date: string
  start_time: string
  end_time: string
  stage_ja: string
  stage_en: string
  status: string
  note_ja: string
  note_en: string
  is_stream?: boolean
}

export async function listApprovedPerformers(): Promise<Performer[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('performers').select('*').eq('is_approved', true).order('stage_name')
  if (error) throw error
  return (data as Performer[]) ?? []
}

export async function listEventVenues(eventId: string): Promise<EventVenueRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_venues').select('*').eq('event_id', eventId).order('sort_order')
  if (error) throw error
  return (data as EventVenueRow[]) ?? []
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
  const sb = requireSupabase()
  const { data, error } = await sb.from('event_lineup').select('performer_id').eq('event_id', eventId).order('sort_order')
  if (error) throw error
  return (data ?? []).map((r) => r.performer_id as string)
}

export async function addEventLineup(eventId: string, performerId: string) {
  const sb = requireSupabase()
  const { error } = await sb.from('event_lineup').upsert({ event_id: eventId, performer_id: performerId, sort_order: 0 })
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
  const { data, error } = await sb.from('performers').select('*').in('id', ids)
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

export async function createMerchCheckout(productId: string, quantity: number): Promise<string> {
  const res = await fetch('/api/stripe/merch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ productId, quantity }),
  })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !json.url) throw new Error(json.error || 'Checkout failed')
  return json.url
}
