import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'
import { prevTokyoDay, requireAdmin, tokyoDay } from './_guard.js'
import { buildAlerts } from './_agents.js'
import { readSnapshot, type OpsMetrics } from './_snapshot.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const admin = await requireAdmin(req, res)
    if (!admin) return

    const sb = getAdminSupabase()
    const day = tokyoDay()
    const today = await readSnapshot(sb, day)
    const yesterday = await readSnapshot(sb, prevTokyoDay(day))
    const alerts = today ? buildAlerts(today, yesterday) : [{ text: '本日のスナップショットがありません。「分析を回す」を実行してください。', severity: 'info' as const }]

    const { data: proposals, error } = await sb
      .from('ops_proposals')
      .select('id, agent, title, body, severity, status, payload, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error

    const { data: memories } = await sb
      .from('ops_memories')
      .select('id, kind, summary, why, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    res.status(200).json({
      day,
      today: today as OpsMetrics | null,
      yesterday,
      alerts,
      proposals: proposals ?? [],
      memories: memories ?? [],
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'ops inbox failed' })
  }
}
