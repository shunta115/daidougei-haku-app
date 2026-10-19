import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSupabase, cookieValue, exchangeOAuthCode, getDestination, hashOpaqueToken, randomOpaqueToken, requirePerformer, youtubeAuthorizationUrl, encryptSecret } from './_shared.js'

const OAUTH_COOKIE = 'haku_multi_live_oauth'
const OAUTH_TTL_SECONDS = 10 * 60

function bindingCookie(req: VercelRequest, value: string, maxAge: number) {
  const host = typeof req.headers.host === 'string' ? req.headers.host : ''
  const secure = !host.includes('localhost') && !host.startsWith('127.')
  return `${OAUTH_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/api/multi-live/youtube-oauth; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function appOrigin(req: VercelRequest) {
  const configured = process.env.APP_URL?.replace(/\/$/, '')
  if (configured) return configured
  const host = typeof req.headers.host === 'string' ? req.headers.host : ''
  return `${host.includes('localhost') ? 'http' : 'https'}://${host}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'POST') {
      const user = await requirePerformer(req, res)
      if (!user) return
      const completionToken = typeof req.body?.completionToken === 'string' ? req.body.completionToken : ''
      if (completionToken) {
        const { data: completed, error: completionError } = await adminSupabase().rpc('complete_multi_live_oauth_session', {
          p_completion_hash: hashOpaqueToken(completionToken),
          p_performer_id: user.id,
        })
        if (completionError || completed !== true) {
          res.status(403).json({ error: 'YouTube認証の完了要求が期限切れ、再利用、または別ユーザーのものです。' })
          return
        }
        res.status(200).json({ connected: true })
        return
      }
      if (!await getDestination(user.id)) {
        res.status(409).json({ error: '先にYouTube配信先を保存してください。' })
        return
      }
      const state = randomOpaqueToken()
      const browserBinding = randomOpaqueToken()
      const expiresAt = new Date(Date.now() + OAUTH_TTL_SECONDS * 1000).toISOString()
      const { error } = await adminSupabase().from('multi_live_oauth_sessions').insert({
        state_hash: hashOpaqueToken(state),
        performer_id: user.id,
        browser_binding_hash: hashOpaqueToken(browserBinding),
        expires_at: expiresAt,
      })
      if (error) throw error
      res.setHeader('Set-Cookie', bindingCookie(req, browserBinding, OAUTH_TTL_SECONDS))
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ authorizationUrl: youtubeAuthorizationUrl(state) })
      return
    }
    if (req.method === 'GET') {
      const code = typeof req.query.code === 'string' ? req.query.code : ''
      const state = typeof req.query.state === 'string' ? req.query.state : ''
      if (!code || !state) {
        res.redirect(302, `${appOrigin(req)}/?youtube=oauth_error`)
        return
      }
      const browserBinding = cookieValue(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined, OAUTH_COOKIE)
      if (!browserBinding) throw new Error('OAuth browser binding missing')
      const { data: performerId, error: consumeError } = await adminSupabase().rpc('consume_multi_live_oauth_session', {
        p_state_hash: hashOpaqueToken(state),
        p_browser_binding_hash: hashOpaqueToken(browserBinding),
      })
      if (consumeError || typeof performerId !== 'string') throw new Error('OAuth state expired, replayed, or belongs to another browser')
      if (!await getDestination(performerId)) throw new Error('Destination not found')
      const oauth = await exchangeOAuthCode(code)
      const completionToken = randomOpaqueToken()
      const { data: authorizedSession, error } = await adminSupabase().from('multi_live_oauth_sessions').update({
        encrypted_oauth: encryptSecret(oauth),
        completion_hash: hashOpaqueToken(completionToken),
        authorized_at: new Date().toISOString(),
      }).eq('state_hash', hashOpaqueToken(state)).eq('performer_id', performerId).is('completed_at', null).select('state_hash').maybeSingle()
      if (error || !authorizedSession) throw error || new Error('OAuth pending session missing')
      res.setHeader('Set-Cookie', bindingCookie(req, '', 0))
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, `${appOrigin(req)}/#youtube_oauth_completion=${encodeURIComponent(completionToken)}`)
      return
    }
    if (req.method === 'DELETE') {
      const user = await requirePerformer(req, res)
      if (!user) return
      const { error } = await adminSupabase().from('multi_live_destinations').update({
        encrypted_oauth: null,
        youtube_broadcast_id: null,
        actual_visibility: null,
        visibility_confirmed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('performer_id', user.id).eq('provider', 'youtube')
      if (error) throw error
      res.status(204).end()
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('youtube oauth failed', { name: error instanceof Error ? error.name : 'unknown' })
    if (req.method === 'GET') {
      res.setHeader('Set-Cookie', bindingCookie(req, '', 0))
      res.redirect(302, `${appOrigin(req)}/?youtube=oauth_error`)
    }
    else res.status(500).json({ error: 'YouTube連携を完了できませんでした。' })
  }
}
