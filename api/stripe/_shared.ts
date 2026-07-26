import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'

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
