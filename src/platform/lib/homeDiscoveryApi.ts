import { requireSupabase } from './supabase'
import type { HomeSession } from './homeDiscovery'

/** Read only. Open sessions must not disappear behind a fixed history limit. */
export async function listHomeSessions(): Promise<HomeSession[]> {
  const rows: HomeSession[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await requireSupabase().from('live_sessions')
      .select('id,performer_id,started_at,ended_at,heartbeat_at')
      .or(`ended_at.is.null,started_at.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`)
      .order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []) as HomeSession[])
    if (!data || data.length < 500) return rows
  }
}
