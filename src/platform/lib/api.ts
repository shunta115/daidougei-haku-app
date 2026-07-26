import { requireSupabase } from './supabase'
import type { AdminMetrics, LiveSession, NotificationRow, Performer } from './types'

export async function searchPerformers(query: string): Promise<Performer[]> {
  const sb = requireSupabase()
  let q = sb.from('performers').select('*').eq('is_approved', true).order('is_live', { ascending: false })
  const trimmed = query.trim()
  if (trimmed) {
    q = q.or(`stage_name.ilike.%${trimmed}%,genre.ilike.%${trimmed}%,city.ilike.%${trimmed}%,country.ilike.%${trimmed}%`)
  }
  const { data, error } = await q.limit(50)
  if (error) throw error
  return (data as Performer[]) ?? []
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

export async function updatePerformer(id: string, patch: Partial<Performer>) {
  const sb = requireSupabase()
  const { error } = await sb.from('performers').update(patch).eq('id', id)
  if (error) throw error
}

export async function startLive(performerId: string, streamUrl?: string) {
  const sb = requireSupabase()
  const now = new Date().toISOString()
  const { error: uerr } = await sb
    .from('performers')
    .update({ is_live: true, live_started_at: now, stream_url: streamUrl || null })
    .eq('id', performerId)
  if (uerr) throw uerr
  const { error } = await sb.from('live_sessions').insert({
    performer_id: performerId,
    stream_url: streamUrl || null,
  })
  if (error) throw error
}

export async function endLive(performerId: string) {
  const sb = requireSupabase()
  const { error: uerr } = await sb
    .from('performers')
    .update({ is_live: false, live_started_at: null })
    .eq('id', performerId)
  if (uerr) throw uerr
  const { data: open } = await sb
    .from('live_sessions')
    .select('id')
    .eq('performer_id', performerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (open?.id) {
    await sb.from('live_sessions').update({ ended_at: new Date().toISOString() }).eq('id', open.id)
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
  const { error } = await sb.from('performers').update({ is_approved: true }).eq('id', id)
  if (error) throw error
  await sb.from('profiles').update({ status: 'active' }).eq('id', id)
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
