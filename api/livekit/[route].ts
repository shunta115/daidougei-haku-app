import type { VercelRequest, VercelResponse } from '@vercel/node'
import presence from './_presence.js'
import token from './_token.js'

const handlers: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  presence,
  token,
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
