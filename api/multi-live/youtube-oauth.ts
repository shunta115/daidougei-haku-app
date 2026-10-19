import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminSupabase, createOAuthState, exchangeOAuthCode, getDestination, parseOAuthState, requirePerformer, youtubeAuthorizationUrl, encryptSecret } from './_shared.js'

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
      if (!await getDestination(user.id)) {
        res.status(409).json({ error: '先にYouTube配信先を保存してください。' })
        return
      }
      res.status(200).json({ authorizationUrl: youtubeAuthorizationUrl(createOAuthState(user.id)) })
      return
    }
    if (req.method === 'GET') {
      const code = typeof req.query.code === 'string' ? req.query.code : ''
      const state = typeof req.query.state === 'string' ? req.query.state : ''
      if (!code || !state) {
        res.redirect(302, `${appOrigin(req)}/?youtube=oauth_error`)
        return
      }
      const performerId = parseOAuthState(state)
      if (!await getDestination(performerId)) throw new Error('Destination not found')
      const oauth = await exchangeOAuthCode(code)
      const { error } = await adminSupabase().from('multi_live_destinations').update({ encrypted_oauth: encryptSecret(oauth), updated_at: new Date().toISOString() }).eq('performer_id', performerId).eq('provider', 'youtube')
      if (error) throw error
      res.redirect(302, `${appOrigin(req)}/?youtube=connected`)
      return
    }
    if (req.method === 'DELETE') {
      const user = await requirePerformer(req, res)
      if (!user) return
      const { error } = await adminSupabase().from('multi_live_destinations').update({ encrypted_oauth: null, updated_at: new Date().toISOString() }).eq('performer_id', user.id).eq('provider', 'youtube')
      if (error) throw error
      res.status(204).end()
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('youtube oauth failed', { name: error instanceof Error ? error.name : 'unknown' })
    if (req.method === 'GET') res.redirect(302, `${appOrigin(req)}/?youtube=oauth_error`)
    else res.status(500).json({ error: 'YouTube連携を完了できませんでした。' })
  }
}
