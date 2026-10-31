import { requireSupabase, supabaseAuthHeaders } from './supabase'
export const smartPushEnabled = import.meta.env.VITE_ENABLE_SMART_PUSH === 'true'
export type BroadcastMode = 'test' | 'public_silent' | 'public_notify'
export type SmartPushPreference = {
  appearance_push_enabled: boolean; live_push_enabled: boolean; push_all_enabled: boolean; push_timezone: string;
  push_start_hour: number; push_end_hour: number; push_daily_limit: number; push_weekly_limit: number;
}
export async function getSmartPushPreference(userId: string): Promise<SmartPushPreference | null> {
  if (!smartPushEnabled) return null
  const response = await fetch('/api/notifications/push?mode=live-start')
  if (!response.ok || !(await response.json()).liveStartEnabled) return null
  const { data, error } = await requireSupabase().from('notification_preferences')
    .select('appearance_push_enabled,live_push_enabled,push_all_enabled,push_timezone,push_start_hour,push_end_hour,push_daily_limit,push_weekly_limit').eq('user_id', userId).maybeSingle()
  if (error) return null
  return data as SmartPushPreference | null ?? { appearance_push_enabled: false, live_push_enabled: false, push_all_enabled: true, push_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', push_start_hour: 9, push_end_hour: 21, push_daily_limit: 2, push_weekly_limit: 8 }
}
export async function saveSmartPushPreference(userId: string, patch: Partial<SmartPushPreference>) {
  if (!smartPushEnabled) throw new Error('smart_push_unavailable')
  const { error } = await requireSupabase().from('notification_preferences').upsert({
    user_id: userId, ...patch, updated_at: new Date().toISOString(),
  })
  if (error) throw new Error('通知設定を保存できませんでした。')
}
export async function setLivePushIntent(sessionId: string, enabled: boolean) {
  if (!smartPushEnabled) return
  const { error } = await requireSupabase().rpc('set_live_push_intent', { p_session_id: sessionId, p_notify: enabled })
  if (error) throw new Error('通知設定を保存できないため、フォロワー通知を開始していません。')
}
export async function dispatchLivePush(sessionId: string) {
  if (!smartPushEnabled) return
  // Each invocation processes at most five previously unattempted recipients.
  // No client retries or unbounded pagination.
  await fetch('/api/notifications/push?mode=live-start', {
    method: 'POST', headers: { ...await supabaseAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ liveSessionId: sessionId }),
  })
}
