import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { User } from '@supabase/supabase-js'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<User | null> {
  const user = await requireAuthUser(req, res)
  if (!user) return null
  const sb = getAdminSupabase()
  const { data } = await sb.from('profiles').select('role, status, email').eq('id', user.id).maybeSingle()
  if (!data || data.role !== 'admin' || data.status !== 'active') {
    res.status(403).json({ error: 'admin only' })
    return null
  }
  const allowlist = (process.env.HAKU_ADMIN_IDENTIFIERS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (process.env.VERCEL_ENV === 'production' && allowlist.length === 0) {
    res.status(503).json({ error: 'admin allowlist is not configured' })
    return null
  }
  const email = String(user.email || data.email || '').trim().toLowerCase()
  if (allowlist.length > 0 && !allowlist.includes(user.id.toLowerCase()) && !allowlist.includes(email)) {
    res.status(403).json({ error: 'admin not allowlisted' })
    return null
  }
  return user
}

export function tokyoDay(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}

export function prevTokyoDay(day: string): string {
  const [y, m, dd] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, dd))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${d2}`
}
