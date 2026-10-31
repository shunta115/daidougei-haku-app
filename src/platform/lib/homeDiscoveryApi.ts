import { requireSupabase } from './supabase'
import type { HomeSession } from './homeDiscovery'

/** Read only; never calls the presence reconciliation endpoint (which can end rooms). */
export async function listHomeSessions(): Promise<HomeSession[]> {
  const { data, error } = await requireSupabase().from('live_sessions')
    .select('performer_id,started_at,ended_at,heartbeat_at')
    .or(`ended_at.is.null,started_at.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`)
    .order('started_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []) as HomeSession[]
}
