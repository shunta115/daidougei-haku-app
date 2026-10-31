import { rankHome } from '../../shared/homeRanking'
export const performers = Array.from({ length: 22 }, (_, i) => ({
  id: `qa-${i}`, stage_name: ['最近ログインのパフォーマー', 'Stripe登録済み', '出演中のパフォーマー', '本日の出演者', '明日の出演者'][i] ?? `パフォーマー ${i + 1}`,
  bio: '紹介', genre: '大道芸', country: '日本', city: '東京', photo_url: null, support_blurb: '',
  stripe_onboarding_complete: i === 1, is_approved: true, is_private_test: false,
  is_live: i === 2, live_started_at: null, live_title: 'サンプルLIVE', stream_url: null,
  share_location: false, lat: null, lng: null, location_updated_at: null, created_at: '', updated_at: '',
}))
let changed = false
const params = new URLSearchParams(location.search)
export const liveReservationsEnabled = true
let reserved: string[] = []
export async function listUpcomingLiveSchedules() { return [{id: 'qa-schedule', performer_id: 'qa-5', title: '予約用LIVE', status: 'scheduled', scheduled_start_at: new Date(Date.now()+1800000).toISOString()}] }
export async function listOwnLiveReservationIds() { return [...reserved] }
export async function reserveLiveSchedule(id: string) { reserved = [...new Set([...reserved,id])] }
export async function cancelLiveReservation(id: string) { reserved = reserved.filter(x => x !== id) }
export async function listHomeSessions() { return params.has('no-live') ? [] : [{performer_id:'qa-2',started_at:new Date(Date.now()-60000).toISOString(),heartbeat_at:new Date(Date.now()).toISOString(),ended_at:null}] }
export function updateFixture() { changed = true; window.dispatchEvent(new Event('online')) }
export function snapshot() {
  const now = Date.now()
  return rankHome(performers.map((p,i) => ({ ...p, lastSignIn: new Date(now - (changed && i === 1 ? 0 : i + 1) * 60000).toISOString() })), [
    { performerId: 'qa-2', startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 60000 * 30).toISOString(), title: 'サンプル出演中' },
    { performerId: 'qa-3', startsAt: new Date(now + 3600000).toISOString(), endsAt: null, title: '本日のサンプル' },
    { performerId: 'qa-4', startsAt: new Date(now + 86400000).toISOString(), endsAt: null, title: '明日のサンプル' },
  ].filter(() => !params.has('no-appearance')),now)
}
export async function listLivePerformers() { return params.has('no-live') ? [] : performers.filter(p=>p.is_live) }
export async function listOshiPerformers() { return [performers[6]] }
export async function listFollowedPerformers() { return [performers[6]] }
export async function getFeaturedEvent() { return null }
export async function getTodayOfficialNavigator() { return null }
const qaUser = {id:'fixture-user'}
export function useAuth() { return { user: params.has('guest') ? null : qaUser } }
export function useTrackView() {}
export const supabase = null
export const isSupabaseConfigured = false
export function requireSupabase() {
  return { from: () => ({ select: () => ({ in: (_: string, ids: string[]) => ({ eq: () => ({ eq: async () => ({ data: performers.filter(p=>ids.includes(p.id)), error: null }) }) }) }) }) }
}

export function trackProductEvent() {}
