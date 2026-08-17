import Stripe from 'stripe'
import { createClient, type User } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const PLATFORM_FEE_BPS = 1000

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

export function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials missing')
  return createClient(url, key)
}

export function getAppUrl(req: VercelRequest) {
  return (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '')
}

export function calcPlatformFee(amountYen: number) {
  return Math.floor((amountYen * PLATFORM_FEE_BPS) / 10000)
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
