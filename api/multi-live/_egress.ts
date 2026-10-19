import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { acquireEgressLease, adminSupabase, egressClient, finalizeEgressLease, getDestination, publicErrorCode, reconcileDestinationEgress, requirePerformer, resolveYouTubeBroadcast, runtimeStateFromEgress, safeDestination, startYouTubeEgress, updateRuntimeState, youtubeStartSafety } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requirePerformer(req, res)
  if (!user) return
  try {
    let row = await getDestination(user.id)
    if (!row) {
      res.status(404).json({ error: 'YouTube配信先が未設定です。' })
      return
    }
    if (req.method === 'GET') {
      if (row.egress_id) row = await reconcileDestinationEgress(row)
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    if (req.method === 'POST') {
      if (!row.enabled) {
        res.status(409).json({ error: 'YouTube同時配信が無効です。' })
        return
      }
      if (row.egress_id) row = await reconcileDestinationEgress(row)
      if (row.egress_id && ['starting', 'live'].includes(row.status)) {
        res.status(200).json(safeDestination(row))
        return
      }
      const { data: performer, error: performerError } = await adminSupabase().from('performers').select('is_live,is_private_test').eq('id', user.id).maybeSingle()
      if (performerError || !performer?.is_live) {
        res.status(409).json({ error: 'HAKU LIVEの開始後に同時配信を開始してください。' })
        return
      }
      if (!row.encrypted_oauth) {
        res.status(409).json({ error: 'YouTubeの実際の公開範囲を確認するため公式OAuth接続が必要です。' })
        return
      }
      const actual = await resolveYouTubeBroadcast(row)
      const confirmed = row.youtube_broadcast_id === actual.id && Boolean(row.visibility_confirmed_at)
      const safetyError = youtubeStartSafety({
        requestedVisibility: row.visibility,
        actualVisibility: actual.privacyStatus,
        confirmed,
        privateHakuLive: Boolean(performer.is_private_test),
        lifeCycleStatus: actual.lifeCycleStatus,
      })
      if (safetyError) {
        const messages = {
          visibility_unconfirmed: 'YouTube側の実際の公開範囲を確認し、明示的に承認してください。',
          private_haku_requires_private_youtube: '非公開HAKU LIVEはYouTube側も非公開にする必要があります。',
          broadcast_not_ready: 'YouTube LIVEが配信可能な状態ではありません。',
        }
        res.status(409).json({ error: messages[safetyError] })
        return
      }
      const leaseToken = randomUUID()
      if (!await acquireEgressLease(user.id, leaseToken)) {
        res.status(200).json(safeDestination(await getDestination(user.id)))
        return
      }
      try {
        const info = await startYouTubeEgress(row)
        const afterStart = await getDestination(user.id)
        if (afterStart?.egress_stop_requested) {
          try {
            await egressClient().stopEgress(info.egressId)
            await finalizeEgressLease(user.id, leaseToken, { egress_id: null, status: 'stopped', last_error_code: null })
          } catch {
            // Keep the real Egress id so the presence reaper can retry the stop.
            await finalizeEgressLease(user.id, leaseToken, { egress_id: info.egressId, status: 'failed', last_error_code: 'stop_failed' })
          }
        } else if (!await finalizeEgressLease(user.id, leaseToken, runtimeStateFromEgress(info))) {
          try {
            await egressClient().stopEgress(info.egressId)
          } catch {
            // A lost/expired lease must not make a paid Egress unreachable.
            await adminSupabase()
              .from('multi_live_destinations')
              .update({ egress_id: info.egressId, status: 'failed', last_error_code: 'stop_failed' })
              .eq('performer_id', user.id)
              .eq('provider', 'youtube')
              .is('egress_id', null)
          }
          throw new Error('EGRESS_LEASE_LOST')
        }
      } catch (error) {
        await finalizeEgressLease(user.id, leaseToken, { egress_id: null, status: 'failed', last_error_code: publicErrorCode(error) })
      }
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    if (req.method === 'DELETE') {
      if (row.egress_lease_token && row.egress_lease_expires_at && new Date(row.egress_lease_expires_at).getTime() > Date.now()) {
        const { error } = await adminSupabase().from('multi_live_destinations').update({ egress_stop_requested: true }).eq('performer_id', user.id).eq('provider', 'youtube').eq('egress_lease_token', row.egress_lease_token)
        if (error) throw error
      }
      if (row.egress_id) {
        try {
          await egressClient().stopEgress(row.egress_id)
        } catch (error) {
          const code = publicErrorCode(error)
          if (code !== 'room_not_ready') {
            await updateRuntimeState(user.id, { status: 'failed', last_error_code: 'stop_failed' })
            res.status(502).json({ error: '外部配信の停止を確認できませんでした。もう一度お試しください。' })
            return
          }
        }
      }
      if (!row.egress_lease_token || !row.egress_lease_expires_at || new Date(row.egress_lease_expires_at).getTime() <= Date.now()) {
        await updateRuntimeState(user.id, { egress_id: null, status: 'stopped', last_error_code: null })
      }
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('multi-live egress failed', { name: error instanceof Error ? error.name : 'unknown' })
    res.status(500).json({ error: '同時配信の状態を更新できませんでした。' })
  }
}
