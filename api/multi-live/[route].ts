import type { VercelRequest, VercelResponse } from '@vercel/node'
import destination from './_destination.js'
import egress from './_egress.js'
import youtubeBroadcast from './_youtube-broadcast.js'
import youtubeChat from './_youtube-chat.js'
import youtubeOauth from './_youtube-oauth.js'

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  destination,
  egress,
  'youtube-broadcast': youtubeBroadcast,
  'youtube-chat': youtubeChat,
  'youtube-oauth': youtubeOauth,
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const route = typeof req.query.route === 'string' ? req.query.route : ''
  const routeHandler = handlers[route]
  if (!routeHandler) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  return routeHandler(req, res)
}
