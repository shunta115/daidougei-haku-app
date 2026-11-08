import { requireSupabase } from './supabase'

// TEST harness adapter only. The shared validation DB already has guarded LIVE
// RPCs from another experiment; never weaken its guards or change prod lifecycle.
export const smartPushTestLifecycle = import.meta.env.VITE_SMART_PUSH_TEST_LIFECYCLE === 'true'
  && import.meta.env.VITE_SUPABASE_URL === 'https://aeqskxxykzapgaudbeqa.supabase.co'

export async function startSmartPushTestLive(performerId: string, title?: string) {
  const sb = requireSupabase(), operation = crypto.randomUUID()
  const reserved = await sb.rpc('reserve_direct_live', { p_performer_id: performerId, p_operation_id: operation, p_title: title?.trim() || null })
  if (reserved.error || !reserved.data) throw new Error('TEST配信を準備できませんでした。')
  const id = String(reserved.data)
  const active = await sb.rpc('activate_direct_live', { p_performer_id: performerId, p_session_id: id, p_operation_id: operation, p_title: title?.trim() || null })
  if (active.error) {
    await sb.rpc('finish_direct_live', { p_performer_id: performerId, p_session_id: id })
    throw new Error('TEST配信の公開を確認できませんでした。')
  }
  return id
}
export async function endSmartPushTestLive(performerId: string) {
  const sb = requireSupabase()
  const { data, error } = await sb.from('live_sessions').select('id').eq('performer_id', performerId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('TEST配信を確認できませんでした。')
  if (!data) return
  const result = await sb.rpc('finish_direct_live', { p_performer_id: performerId, p_session_id: data.id })
  if (result.error) throw new Error('TEST配信の終了を確認できませんでした。')
}
