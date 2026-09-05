import { supabaseAuthHeaders } from './supabase'

export type OpsInboxProposal = {
  id: string
  agent: 'ceo' | 'growth'
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  status: string
  created_at: string
}

export type OpsInbox = {
  day: string
  today: Record<string, number | null> | null
  yesterday: Record<string, number | null> | null
  alerts: Array<{ text: string; severity: string }>
  proposals: OpsInboxProposal[]
  memories: Array<{ id: string; kind: string; summary: string; why: string; created_at: string }>
}

async function opsFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await supabaseAuthHeaders()),
      ...(init?.headers ?? {}),
    },
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(json.error || `ops ${res.status}`)
  return json
}

export async function fetchOpsInbox(): Promise<OpsInbox> {
  return (await opsFetch('/api/ops/inbox')) as OpsInbox
}

export async function runOpsAnalysis() {
  return opsFetch('/api/ops/run', { method: 'POST', body: '{}' })
}

export async function decideOpsProposal(proposalId: string, decision: 'approved' | 'revised' | 'rejected', note = '') {
  return opsFetch('/api/ops/decide', {
    method: 'POST',
    body: JSON.stringify({ proposalId, decision, note }),
  })
}
