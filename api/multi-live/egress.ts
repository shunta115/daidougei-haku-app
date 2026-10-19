import type { VercelRequest, VercelResponse } from '@vercel/node'
import { egressClient, getDestination, publicErrorCode, requirePerformer, runtimeStateFromEgress, safeDestination, startYouTubeEgress, updateRuntimeState } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requirePerformer(req, res)
  if (!user) return
  try {
    const row = await getDestination(user.id)
    if (!row) {
      res.status(404).json({ error: 'YouTube配信先が未設定です。' })
      return
    }
    if (req.method === 'GET') {
      if (row.egress_id) {
        const found = (await egressClient().listEgress({ egressId: row.egress_id }))[0]
        await updateRuntimeState(user.id, found ? runtimeStateFromEgress(found) : { egress_id: null, status: 'stopped', last_error_code: null })
      }
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    if (req.method === 'POST') {
      if (!row.enabled) {
        res.status(409).json({ error: 'YouTube同時配信が無効です。' })
        return
      }
      if (row.egress_id && ['starting', 'live'].includes(row.status)) {
        res.status(200).json(safeDestination(row))
        return
      }
      await updateRuntimeState(user.id, { status: 'starting', last_error_code: null })
      try {
        const info = await startYouTubeEgress(row)
        await updateRuntimeState(user.id, runtimeStateFromEgress(info))
      } catch (error) {
        await updateRuntimeState(user.id, { egress_id: null, status: 'failed', last_error_code: publicErrorCode(error) })
      }
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    if (req.method === 'DELETE') {
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
      await updateRuntimeState(user.id, { egress_id: null, status: 'stopped', last_error_code: null })
      res.status(200).json(safeDestination(await getDestination(user.id)))
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('multi-live egress failed', { name: error instanceof Error ? error.name : 'unknown' })
    res.status(500).json({ error: '同時配信の状態を更新できませんでした。' })
  }
}
