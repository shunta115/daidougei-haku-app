import { requireSupabase } from './supabase'
import { PERFORMER_CLIENT_SELECT } from './performerColumns'
import type { Performer } from './types'
import type { HomeAppearance, HomeRanking } from '../../../shared/homeRanking'
export async function loadHomeRanking(): Promise<{ ranking: HomeRanking; performers: Performer[] }> {
  const response = await fetch('/api/home-ranking', { cache: 'no-store' })
  if (!response.ok) throw new Error('Home ranking unavailable')
  const ranking: HomeRanking = await response.json()
  const performers: Performer[] = []
  const sb = requireSupabase()
  for (let i = 0; i < ranking.ids.length; i += 100) {
    const { data, error } = await sb.from('performers').select(PERFORMER_CLIENT_SELECT)
      .in('id', ranking.ids.slice(i, i + 100)).eq('is_approved', true).eq('is_private_test', false)
    if (error) throw error
    performers.push(...(data ?? []) as unknown as Performer[])
  }
  return { ranking, performers }
}
export function appearanceLabel(appearance: HomeAppearance, now = Date.now()): string {
  const start = Date.parse(appearance.startsAt)
  if (start <= now && appearance.endsAt && Date.parse(appearance.endsAt) > now) return '出演中'
  const day = (n: number) => Math.floor((n + 9 * 3600_000) / 86400_000)
  const delta = day(start) - day(now)
  const weekday = new Date(now + 9 * 3600_000).getUTCDay()
  const prefix = delta === 0 ? '本日' : delta === 1 ? '明日' : delta >= 0 && delta < 7 - ((weekday + 6) % 7) ? '今週' : ''
  const date = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(start)
  return `${prefix} ${date}`.trim()
}
