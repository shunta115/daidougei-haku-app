import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../stripe/_shared.js'
import { requireAdmin } from './_guard.js'

const DECISIONS = ['approved', 'revised', 'rejected'] as const
type Decision = (typeof DECISIONS)[number]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const admin = await requireAdmin(req, res)
    if (!admin) return

    const { proposalId, decision, note } = req.body as {
      proposalId?: string
      decision?: string
      note?: string
    }
    if (!proposalId || !DECISIONS.includes(decision as Decision)) {
      res.status(400).json({ error: 'proposalId and decision required' })
      return
    }
    const sb = getAdminSupabase()
    const { data: proposal, error: perr } = await sb
      .from('ops_proposals')
      .select('id, title, status, payload')
      .eq('id', proposalId)
      .maybeSingle()
    if (perr) throw perr
    if (!proposal) {
      res.status(404).json({ error: 'proposal not found' })
      return
    }
    if (proposal.status !== 'pending') {
      res.status(409).json({ error: 'proposal is not pending' })
      return
    }

    const actionType = (proposal.payload as { action_type?: string } | null)?.action_type
    if (actionType && actionType !== 'none') {
      res.status(403).json({ error: 'dangerous actions are not auto-executed' })
      return
    }

    const { error: uerr } = await sb.from('ops_proposals').update({ status: decision }).eq('id', proposalId)
    if (uerr) throw uerr

    const { error: aerr } = await sb.from('ops_approvals').insert({
      proposal_id: proposalId,
      admin_id: admin.id,
      decision,
      note: (note ?? '').slice(0, 1000),
    })
    if (aerr) throw aerr

    const { error: merr } = await sb.from('ops_memories').insert({
      kind: 'decision',
      summary: `${decision}: ${proposal.title}`,
      why: (note ?? '').slice(0, 1000) || (decision === 'approved' ? '人間が承認' : decision === 'rejected' ? '人間が却下' : '人間が修正指示'),
      proposal_id: proposalId,
      metrics: { executed: false, action_type: 'none' },
    })
    if (merr) throw merr

    res.status(200).json({
      ok: true,
      executed: false,
      message: '記録しました。危険操作は自動実行しません。',
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'ops decide failed' })
  }
}
