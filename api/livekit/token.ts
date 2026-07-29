import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createLiveKitToken, getLiveKitConfig, roomNameForPerformer } from './_shared.js'

function userClient(authHeader: string | undefined) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase env missing')
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization required' })
      return
    }

    const { performerId, asHost } = req.body as { performerId?: string; asHost?: boolean }
    if (!performerId) {
      res.status(400).json({ error: 'performerId required' })
      return
    }

    const sb = userClient(authHeader)
    const { data: authData, error: authErr } = await sb.auth.getUser()
    if (authErr || !authData.user) {
      res.status(401).json({ error: 'Invalid session' })
      return
    }
    const user = authData.user

    const { data: performer, error: perr } = await sb.from('performers').select('id, stage_name, is_approved, is_live').eq('id', performerId).maybeSingle()
    if (perr || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }

    const host = Boolean(asHost)
    if (host) {
      if (user.id !== performerId) {
        res.status(403).json({ error: 'Only the performer can host this room' })
        return
      }
      if (!performer.is_approved) {
        res.status(403).json({ error: 'Performer is not approved yet' })
        return
      }
    }

    const { data: profile } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
    const displayName = profile?.display_name || user.email || 'Guest'
    const room = roomNameForPerformer(performerId)
    const token = await createLiveKitToken({
      identity: user.id,
      name: host ? performer.stage_name || displayName : displayName,
      room,
      canPublish: host,
    })

    const { url } = getLiveKitConfig()
    res.status(200).json({
      token,
      url,
      room,
      performerId,
      identity: user.id,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Token failed' })
  }
}
