import { supabaseAuthHeaders } from '../platform/lib/supabase'

export async function hakuAdmin(resource: string, action = 'list', payload: Record<string, unknown> = {}) {
  const response = await fetch('/api/ops/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ resource, action, payload }),
  })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error || `admin ${response.status}`)
  return body
}
