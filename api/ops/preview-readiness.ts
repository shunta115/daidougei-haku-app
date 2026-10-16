import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripeMode } from '../stripe/_shared.js'

function supabaseProjectRef() {
  const value = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return 'unknown'
    return url.hostname.slice(0, -'.supabase.co'.length) || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Preview-only, read-only readiness probe. It never returns credentials,
 * account identifiers, webhook secrets, database contents, or key fragments.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (process.env.VERCEL_ENV !== 'preview') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const mode = stripeMode()
  const projectRef = supabaseProjectRef()
  res.status(mode === 'test' && projectRef !== 'unknown' ? 200 : 503).json({
    environment: 'preview',
    stripeMode: mode,
    supabaseProjectRef: projectRef,
    safeForStripeOnboardingTest: mode === 'test' && projectRef !== 'unknown',
  })
}
