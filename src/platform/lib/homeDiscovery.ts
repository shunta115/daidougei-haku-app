import type { LiveSchedule, Performer, PerformerAppearance } from './types'

export type HomeSession = { performer_id: string; started_at: string; ended_at: string | null; heartbeat_at?: string | null }
const DAY = 86_400_000
export function homeDiscovery(performers: Performer[], liveRows: Performer[], schedules: LiveSchedule[], appearances: PerformerAppearance[], sessions: HomeSession[], now: number) {
  const publicPeople = performers.filter(p => p.is_approved && p.is_private_test !== true && !/^test performer$/i.test(p.stage_name.trim()))
  const byId = new Map(publicPeople.map(p => [p.id, p]))
  const open = new Set(sessions.filter(s => !s.ended_at && Date.parse(s.heartbeat_at || s.started_at) <= now && Date.parse(s.heartbeat_at || s.started_at) >= now - 120_000).map(s => s.performer_id))
  // YouTube enabled is configuration, not proof that a broadcast has started.
  const live = [...new Map(liveRows.map(p => [p.id, p])).values()].filter(p => byId.has(p.id) && p.is_live && open.has(p.id))
  const liveIds = new Set(live.map(p => p.id))
  const upcoming = schedules.filter(s => s.status === 'scheduled' && byId.has(s.performer_id) && !liveIds.has(s.performer_id) && Date.parse(s.scheduled_start_at) >= now - 15 * 60_000)
    .sort((a,b) => Date.parse(a.scheduled_start_at) - Date.parse(b.scheduled_start_at) || a.id.localeCompare(b.id))
  const planned = new Set(appearances.filter(a => a.status === 'published' && Date.parse(a.ends_at || a.starts_at) >= now).map(a => a.performer_id))
  const scheduled = new Set(upcoming.map(s => s.performer_id))
  const recent = new Set(sessions.filter(s => s.ended_at && Date.parse(s.started_at) >= now - 30 * DAY).map(s => s.performer_id))
  const reason = (p: Performer) => liveIds.has(p.id) ? '🔴 LIVE配信中' : scheduled.has(p.id) ? '🟠 LIVE予定あり' : planned.has(p.id) ? '🟢 出演予定あり' : recent.has(p.id) ? '最近LIVEを配信' : Date.parse(p.created_at) <= now && Date.parse(p.created_at) >= now - 30 * DAY ? '✨ NEWパフォーマー' : ''
  // Daily rotation within evidence groups; no popularity, tips, views or login score.
  const rotate = (people: Performer[]) => {
    const sorted = [...people].sort((a,b) => a.id.localeCompare(b.id))
    const offset = sorted.length ? Math.floor((now + 9 * 3_600_000) / DAY) % sorted.length : 0
    return [...sorted.slice(offset), ...sorted.slice(0, offset)]
  }
  const active = rotate(publicPeople.filter(p => scheduled.has(p.id) || planned.has(p.id) || recent.has(p.id)))
  const newcomers = rotate(publicPeople.filter(p => Date.parse(p.created_at) <= now && Date.parse(p.created_at) >= now - 30 * DAY))
  return { now, live, upcoming, active, newcomers, everyone: rotate(publicPeople), byId, reason }
}
