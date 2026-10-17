import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthenticatedSupabase, requireAuthUser } from '../stripe/_shared.js'

const MAX_LENGTH = 80

function validatedDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || Array.from(normalized).length > MAX_LENGTH || /\p{Cc}/u.test(normalized)) return null
  return normalized
}

export async function handleDisplayNameUpdate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  const displayName = validatedDisplayName(req.body?.displayName)
  if (!displayName) return res.status(400).json({ error: `Display name must be 1-${MAX_LENGTH} characters.` })

  // The authenticated user's JWT must be used for these writes. Preview
  // deployments intentionally do not need a service-role key for a user to
  // edit their own profile, and the profiles/performers RLS policies enforce
  // that the id matches auth.uid().
  const sb = getAuthenticatedSupabase(req)
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('role,display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return res.status(500).json({ error: 'Profile update unavailable' })
  if (!profile || !['fan', 'performer'].includes(profile.role)) return res.status(403).json({ error: 'Profile update unavailable' })

  const previousName = String(profile.display_name || '')
  const { error: updateError } = await sb.from('profiles').update({ display_name: displayName }).eq('id', user.id)
  if (updateError) return res.status(500).json({ error: 'Profile update unavailable' })

  if (profile.role === 'performer') {
    const { error: performerError } = await sb.from('performers').update({ stage_name: displayName }).eq('id', user.id)
    if (performerError) {
      const { error: rollbackError } = await sb.from('profiles').update({ display_name: previousName }).eq('id', user.id)
      if (rollbackError) console.error('display_name_rollback_failed', { userId: user.id })
      return res.status(500).json({ error: 'Profile update unavailable' })
    }
  }

  return res.status(200).json({ displayName })
}
