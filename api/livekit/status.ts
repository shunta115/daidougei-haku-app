import type { VercelRequest, VercelResponse } from '@vercel/node'

function present(value: string | undefined) {
  if (!value) return false
  const v = value.trim().replace(/^['"]|['"]$/g, '')
  return Boolean(v) && v !== '[SENSITIVE]'
}

/** Public readiness probe — never returns secret values. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const hasUrl = present(process.env.LIVEKIT_URL) || present(process.env.VITE_LIVEKIT_URL)
  const hasKey = present(process.env.LIVEKIT_API_KEY)
  const hasSecret = present(process.env.LIVEKIT_API_SECRET)

  res.status(200).json({
    configured: hasUrl && hasKey && hasSecret,
    hasUrl,
    hasKey,
    hasSecret,
  })
}
