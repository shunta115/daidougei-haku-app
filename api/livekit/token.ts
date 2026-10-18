import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createLiveKitToken, getLiveKitConfig, roomNameForPerformer } from './_shared.js'
import { getAdminSupabase } from '../stripe/_shared.js'
import { canAccessPrivateTestLive } from './_privacy.js'

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
    const { performerId, asHost } = req.body as { performerId?: string; asHost?: boolean }
    if (!performerId) {
      res.status(400).json({ error: 'performerId required' })
      return
    }

    const host = Boolean(asHost)
    if (host && !authHeader) {
      res.status(401).json({ error: 'Authorization required' })
      return
    }

    const sb = userClient(authHeader)
    const { data: authData } = authHeader
      ? await sb.auth.getUser()
      : { data: { user: null } }
    const user = authData.user
    if (host && !user) {
      res.status(401).json({ error: 'Invalid session' })
      return
    }

    // The server client must identify private-test rows before RLS hides them
    // from anonymous and ordinary authenticated callers.
    const adminSb = getAdminSupabase()
    const { data: performer, error: perr } = await adminSb
      .from('performers')
      .select('id, stage_name, is_approved, is_live, is_private_test')
      .eq('id', performerId)
      .maybeSingle()
    if (perr || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }

    const privateTest = performer.is_private_test === true
    const { data: adminProfile } = user
      ? await adminSb.from('profiles').select('role,status').eq('id', user.id).maybeSingle()
      : { data: null }
    const admin = adminProfile?.role === 'admin' && adminProfile?.status === 'active'
    const { data: openSession } = privateTest
      ? await adminSb
        .from('live_sessions')
        .select('id')
        .eq('performer_id', performerId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null }
    const [{ data: allowlistRow }, { data: viewerProfile }] = user && privateTest && openSession
      ? await Promise.all([
        adminSb
          .from('live_session_viewer_allowlist')
          .select('session_id')
          .eq('session_id', openSession.id)
          .eq('viewer_user_id', user.id)
          .maybeSingle(),
        adminSb.from('profiles').select('role,status').eq('id', user.id).maybeSingle(),
      ])
      : [{ data: null }, { data: null }]
    const isSessionAllowlisted = Boolean(
      allowlistRow
      && viewerProfile?.role === 'fan'
      && viewerProfile?.status === 'active',
    )
    const { data: navigatorAssignment } = user && host && !privateTest
      ? await adminSb
        .from('live_navigator_assignments')
        .select('navigator_id, profiles!live_navigator_assignments_navigator_id_fkey(role,status)')
        .eq('navigator_id', user.id)
        .eq('performer_id', performerId)
        .eq('active', true)
        .maybeSingle()
      : { data: null }
    const navigatorProfile = Array.isArray(navigatorAssignment?.profiles)
      ? navigatorAssignment?.profiles[0]
      : navigatorAssignment?.profiles
    const isNavigator = Boolean(navigatorAssignment && navigatorProfile?.role === 'organizer' && navigatorProfile?.status === 'active')
    if (privateTest && !canAccessPrivateTestLive(user?.id ?? null, performerId, admin, isSessionAllowlisted)) {
      res.status(403).json({ error: 'This private live is restricted to approved viewers' })
      return
    }

    if (host) {
      if (user?.id !== performerId && !(privateTest && admin) && !isNavigator) {
        res.status(403).json({ error: 'Only the performer can host this room' })
        return
      }
      if (!performer.is_approved) {
        res.status(403).json({ error: 'Performer is not approved yet' })
        return
      }
      const { data: hostProfile } = await sb.from('profiles').select('status').eq('id', performerId).maybeSingle()
      if (hostProfile?.status !== 'active') {
        res.status(403).json({ error: 'Performer is not approved yet' })
        return
      }
    } else if (!performer.is_approved || !performer.is_live || (privateTest && !openSession)) {
      res.status(403).json({ error: 'This live stream is not currently available' })
      return
    }

    const { data: profile } = user
      ? await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      : { data: null }
    const guestIdentity = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const identity = privateTest
      ? `private-${host ? 'host' : 'viewer'}-${user!.id}`
      : user?.id ?? guestIdentity
    const displayName = profile?.display_name || user?.email || 'Guest'
    const room = roomNameForPerformer(performerId)
    const token = await createLiveKitToken({
      identity,
      name: host ? performer.stage_name || displayName : displayName,
      room,
      canPublish: host,
      ttl: privateTest ? '15m' : undefined,
    })

    const { url } = getLiveKitConfig()
    res.status(200).json({
      token,
      url,
      room,
      performerId,
      identity,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Token failed' })
  }
}
