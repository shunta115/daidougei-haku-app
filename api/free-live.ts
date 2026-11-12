import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Public previews have no authority store, media provider or production secrets.
 * Do not replace this with in-memory serverless room state: it is not atomic.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(503).json({ mode: 'device-check-only', error: 'cross_device_authority_not_connected' })
}
