import type { SupabaseClient } from '@supabase/supabase-js'

/** Drain feature-owned private objects only; queue/lease stays retryable on failure. */
export async function drainHomeStorage(sb: SupabaseClient, owner: string | null = null) {
  const { data, error } = await sb.rpc('home_claim_cleanup', { p_owner: owner, p_limit: 50 })
  if (error) throw error
  let processed = 0
  let failed = 0
  for (const item of (data || []) as Array<{ path_hash: string; object_path: string; lease_token: string }>) {
    // Defense in depth: never delete bucket roots or an object outside a generated UUID path.
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}(?:-thumb)?\.(?:jpg|pdf)$/i.test(item.object_path)) { failed++; continue }
    const { error: storageError } = await sb.storage.from('performer-home-private').remove([item.object_path])
    if (storageError) { failed++; continue }
    const { data: acknowledged, error: ackError } = await sb.rpc('home_ack_cleanup', { p_hash: item.path_hash, p_token: item.lease_token })
    if (ackError || !acknowledged) failed++
    else processed++
  }
  // Return counters only: paths and requester data never go to the browser/logs.
  return { processed, failed }
}
