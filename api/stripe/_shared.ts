import Stripe from 'stripe'
import { createClient, type User } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const PLATFORM_FEE_BPS = 1000

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (key.startsWith('sk_live_') && process.env.STRIPE_ALLOW_LIVE !== 'true') {
    throw new Error('Live Stripe keys are disabled until STRIPE_ALLOW_LIVE=true')
  }
  return new Stripe(key)
}

export function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials missing')
  return createClient(url, key)
}

export function getAppUrl(req: VercelRequest) {
  const envUrl = process.env.APP_URL?.replace(/\/$/, '')
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    try {
      const parsed = new URL(envUrl)
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return envUrl
      }
    } catch {
      /* ignore invalid APP_URL */
    }
  }
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (process.env.VERCEL_ENV === 'production' && vercelProd) {
    return `https://${vercelProd.replace(/^https?:\/\//, '')}`.replace(/\/$/, '')
  }
  const host = typeof req.headers.host === 'string' ? req.headers.host : ''
  const proto = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  throw new Error('APP_URL is not set')
}

export function calcPlatformFee(amountYen: number, feeBps = PLATFORM_FEE_BPS) {
  return Math.floor((amountYen * feeBps) / 10000)
}

function userClient(authHeader: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase env missing')
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  })
}

export async function requireAuthUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<User | null> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization required' })
    return null
  }
  const sb = userClient(authHeader)
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user
}
