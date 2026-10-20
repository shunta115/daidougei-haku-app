import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'
import { prevTokyoDay, requireAdmin, tokyoDay } from './_guard.js'
import { runCeoAgent, runGrowthAgent, buildAlerts } from './_agents.js'
import { buildDayMetrics, readSnapshot, upsertSnapshot } from './_snapshot.js'
import deviceVotes from '../../server/deviceVotes.js'
import awpResults from '../../server/awpResults.js'
import { getStripe } from '../stripe/_shared.js'
import { retryAutomaticTransfers } from '../stripe/_distribution.js'

function cronAuthorized(req: VercelRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.authorization === `Bearer ${secret}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.job === 'votes-device') return deviceVotes(req, res)
  if (req.query.job === 'awp-results') return awpResults(req, res)
  if (req.query.job === 'stripe-transfer-retry') {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const result = await retryAutomaticTransfers(getAdminSupabase(), getStripe())
      return res.status(200).json({ ok: true, ...result })
    } catch {
      return res.status(500).json({ error: 'Transfer retry failed' })
    }
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const admin = await requireAdmin(req, res)
    if (!admin) return

    const sb = getAdminSupabase()
    const day = tokyoDay()
    const metrics = await buildDayMetrics(sb, day)
    await upsertSnapshot(sb, day, metrics)
    const yesterday = await readSnapshot(sb, prevTokyoDay(day))
    const alerts = buildAlerts(metrics, yesterday)

    const { count: pendingCount } = await sb
      .from('ops_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    const growth = runGrowthAgent(metrics, yesterday)
    const ceo = runCeoAgent({
      today: metrics,
      yesterday,
      growth,
      pendingCount: pendingCount ?? 0,
      alerts,
    })

    await sb
      .from('ops_proposals')
      .update({ status: 'superseded' })
      .eq('status', 'pending')
      .in('agent', ['ceo', 'growth'])

    const { data: inserted, error } = await sb
      .from('ops_proposals')
      .insert([
        {
          agent: growth.agent,
          title: growth.title,
          body: growth.body,
          severity: growth.severity,
          status: 'pending',
          payload: growth.payload,
        },
        {
          agent: ceo.agent,
          title: ceo.title,
          body: ceo.body,
          severity: ceo.severity,
          status: 'pending',
          payload: ceo.payload,
        },
      ])
      .select('id, agent, title, status')
    if (error) throw error

    res.status(200).json({ ok: true, day, metrics, alerts, proposals: inserted })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'ops run failed' })
  }
}
