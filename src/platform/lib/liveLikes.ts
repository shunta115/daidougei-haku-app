import { requireSupabase } from './supabase'
import { liveRequestSignal } from './liveRequestSignal'

export async function getLiveLikeTotal(performerId: string, startedAt: string): Promise<number> {
  const { data, error } = await requireSupabase().from('live_like_totals')
    .select('total').eq('performer_id', performerId).eq('live_started_at', startedAt).abortSignal(liveRequestSignal()).maybeSingle()
  if (error) throw error
  return Number(data?.total ?? 0)
}

export async function sendLiveLikeBatch(performerId: string, startedAt: string, batchId: string, count: number): Promise<number> {
  const { data, error } = await requireSupabase().rpc('record_live_likes', {
    target_performer_id: performerId, expected_started_at: startedAt, batch_id: batchId, like_count: count,
  }).abortSignal(liveRequestSignal())
  if (error) throw error
  return Number(data)
}

export function subscribeLiveLikeTotal(performerId: string, startedAt: string, onTotal: (total: number) => void, onReady: () => void, onConnectionChange?: (connected: boolean) => void) {
  const sb = requireSupabase()
  const channel = sb.channel(`live-like-total-${performerId}-${startedAt}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_like_totals', filter: `performer_id=eq.${performerId}` }, ({ new: row }) => {
      const value = row as { total?: number; live_started_at?: string }
      if (Date.parse(value.live_started_at ?? '') === Date.parse(startedAt) && Number.isSafeInteger(value.total) && value.total! >= 0) onTotal(value.total!)
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') { onConnectionChange?.(true); onReady() }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) onConnectionChange?.(false)
    })
  return () => { void sb.removeChannel(channel) }
}
