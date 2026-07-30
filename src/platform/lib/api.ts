import { requireSupabase } from './supabase'
import type { AdminMetrics, LiveComment, LiveSession, NotificationRow, Performer, TipRow, TipSummary } from './types'

export async function searchPerformers(query: string): Promise<Performer[]> {
  const sb = requireSupabase()
  // Approved performers only. Filter client-side (PostgREST or+spaces is fragile).
  const { data, error } = await sb
    .from('performers')
    .select('*')
    .eq('is_approved', true)
    .order('is_live', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = (data as Performer[]) ?? []
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return rows
  const words = trimmed.split(/\s+/).filter(Boolean)
  return rows.filter((p) => {
    const hay = [p.stage_name, p.genre, p.city, p.country, p.bio].join(' ').toLowerCase()
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

  // Rejoin: keep open session, refresh title only — avoid duplicate sessions.
  if (alreadyLive && existing?.id) {
    if (liveTitle) {
      await sb.from('live_sessions').update({ title: liveTitle }).eq('id', existing.id)
    }
    return existing.id as string
  }

  // Close any stale open sessions before opening a fresh one.
  if (existing?.id) {
    await sb.from('live_sessions').update({ ended_at: now }).eq('id', existing.id)
  }

  const { data, error } = await sb
    .from('live_sessions')
    .insert({
      performer_id: performerId,
      stream_url: null,
      title: liveTitle,
      started_at: now,
    })
    .select('id')
    .single()
  if (error) throw error

  const stageName = (performerRow?.stage_name as string) || 'パフォーマー'
  await notifyFollowersLiveStart(performerId, stageName, liveTitle)

  return (data?.id as string) ?? null
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

async function notifyFollowersLiveStart(performerId: string, stageName: string, title: string | null) {
  const sb = requireSupabase()
  const { data: follows } = await sb.from('follows').select('fan_id').eq('performer_id', performerId)
  const fanIds = [...new Set((follows ?? []).map((f) => f.fan_id as string).filter(Boolean))]
  if (fanIds.length === 0) return
  const body = title?.trim() ? `${stageName} が「${title.trim()}」を配信開始しました` : `${stageName} がライブ配信を開始しました`
  const rows = fanIds.map((fanId) => ({
    user_id: fanId,
    title: 'LIVE開始',
    body,
    link: `live:${performerId}`,
  }))
  // Chunk to avoid oversized inserts
  for (let i = 0; i < rows.length; i += 50) {
    await sb.from('notifications').insert(rows.slice(i, i + 50))
  }
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
  if (error) throw error
  await sb.from('notifications').insert({
    user_id: performerId,
    title: 'New follower',
    body: 'Someone started following you.',
    link: `/#profile/${fanId}`,
  })
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

  await sb.from('notifications').insert({
    user_id: id,
    title: 'Approved',
    body: 'Your performer profile is now public.',
  })
}

export async function suspendUser(id: string) {
  const sb = requireSupabase()
  await sb.from('profiles').update({ status: 'suspended' }).eq('id', id)
  await sb.from('performers').update({ is_live: false, is_approved: false }).eq('id', id)
}

export async function softDeleteUser(id: string) {
  const sb = requireSupabase()
  await sb.from('profiles').update({ status: 'deleted', display_name: 'Deleted' }).eq('id', id)
  await sb.from('performers').update({ is_live: false, is_approved: false, stage_name: 'Deleted' }).eq('id', id)
}

export async function listUsers() {
  const sb = requireSupabase()
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const sb = requireSupabase()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = sb.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}
