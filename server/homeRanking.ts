import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase } from '../api/stripe/_shared.js'
import { rankHome, slotTimestamp, type HomeRanking, type HomeAppearance, type RankingCandidate } from '../shared/homeRanking.js'

type DB = ReturnType<typeof getAdminSupabase>
// All pages are read, with stable keys: no global 100/500-row truncation before ranking.
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}
export async function readHomeRanking(sb: DB, now = Date.now()): Promise<HomeRanking> {
  const performers = await pages<any>((a, b) => sb.from('performers')
    .select('id,stage_name,is_approved,is_private_test,stripe_onboarding_complete,bio,genre,country,city,photo_url,support_blurb,video_url,profiles!performers_id_fkey!inner(status)')
    .eq('is_approved', true).eq('is_private_test', false).eq('profiles.status', 'active').order('id').range(a, b))
  const candidates: RankingCandidate[] = []
  // Bound concurrent Auth/DB reads; each event query retrieves only this actor's latest action.
  for (let i = 0; i < performers.length; i += 4) {
    candidates.push(...await Promise.all(performers.slice(i, i + 4).map(async p => {
      const [auth, events] = await Promise.all([
        // Auth history is an optional ranking signal. A single failed lookup must
        // not hide all public performers; retain only independently verified actions.
        sb.auth.admin.getUserById(p.id).then(result => result.error ? null : result.data.user).catch(() => null),
        sb.from('product_events').select('created_at').eq('user_id', p.id)
          .lte('created_at', new Date(now).toISOString()).order('created_at', { ascending: false }).limit(1),
      ])
      if (events.error) throw events.error
      return { ...p, lastSignIn: auth?.last_sign_in_at, lastAction: events.data?.[0]?.created_at }
    })))
  }
  const [appearances, slots] = await Promise.all([
    pages<any>((a, b) => sb.from('performer_appearances').select('id,performer_id,starts_at,ends_at,title')
      .eq('status', 'published').is('cancelled_at', null).order('id').range(a, b)),
    pages<any>((a, b) => sb.from('event_slots').select('id,performer_id,date,start_time,end_time,stage_ja,events!inner(status)')
      .eq('events.status', 'published').in('status', ['scheduled', 'live']).order('id').range(a, b)),
  ])
  const schedule: HomeAppearance[] = appearances.map(p => ({ performerId: p.performer_id, startsAt: p.starts_at, endsAt: p.ends_at, title: p.title }))
  for (const p of slots) {
    const startsAt = slotTimestamp(p.date, p.start_time)
    if (startsAt) schedule.push({ performerId: p.performer_id, startsAt, endsAt: slotTimestamp(p.date, p.end_time), title: p.stage_ja || '出演予定' })
  }
  return rankHome(candidates, schedule, now)
}
let cached: { expires: number; value: HomeRanking } | undefined
let pending: Promise<HomeRanking> | undefined
export default async function homeRanking(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= readHomeRanking(getAdminSupabase()).then(value => {
        cached = { value, expires: Date.now() + 60_000 }
        return value
      }).finally(() => { pending = undefined })
      await pending
    }
    // Never serialize auth users, actor event rows, timestamps, counts or profile scores.
    return res.status(200).json(cached!.value)
  } catch {
    return res.status(503).json({ error: 'Home ranking temporarily unavailable' })
  }
}
