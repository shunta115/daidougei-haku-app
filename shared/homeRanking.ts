export type HomeAppearance = { performerId: string; startsAt: string; endsAt: string | null; title: string }
export type RankingCandidate = {
  id: string; is_approved: boolean; is_private_test: boolean; stage_name: string
  stripe_onboarding_complete: boolean; bio?: string; genre?: string; country?: string
  city?: string; photo_url?: string | null; support_blurb?: string; video_url?: string | null
  lastSignIn?: string | null; lastAction?: string | null
}
export type HomeRanking = { unscheduled?: string[]; ids: string[]; featured: string[]; upcoming: HomeAppearance[]; recent: string[] }
const stamp = (value?: string | null) => value ? Date.parse(value) : NaN
function activity(p: RankingCandidate, now: number) {
  return Math.max(0, ...[p.lastSignIn, p.lastAction].map(stamp).filter(n => Number.isFinite(n) && n <= now))
}
function completeness(p: RankingCandidate) {
  return [p.bio, p.genre, p.country, p.city, p.photo_url, p.support_blurb, p.video_url].filter(v => v?.trim()).length
}
export function rankHome(candidates: RankingCandidate[], appearances: HomeAppearance[], now = Date.now()): HomeRanking {
  const unique = new Map(candidates.filter(p => p.is_approved && p.is_private_test === false && !/^test performer$/i.test(p.stage_name.trim())).map(p => [p.id, p]))
  const ranked = [...unique.values()].sort((a, b) => activity(b, now) - activity(a, now)
    || Number(b.stripe_onboarding_complete) - Number(a.stripe_onboarding_complete)
    || completeness(b) - completeness(a) || a.id.localeCompare(b.id))
  const next = new Map<string, HomeAppearance>()
  for (const appearance of appearances) {
    if (!unique.has(appearance.performerId)) continue
    const start = stamp(appearance.startsAt), end = stamp(appearance.endsAt)
    // Unknown end time cannot prove that a past start is still in progress.
    if (!Number.isFinite(start) || (start <= now && (!Number.isFinite(end) || end <= now || end <= start))) continue
    const prev = next.get(appearance.performerId)
    if (!prev || start < stamp(prev.startsAt)) next.set(appearance.performerId, appearance)
  }
  const order = new Map(ranked.map((p, i) => [p.id, i]))
  const upcoming = [...next.values()].sort((a, b) => {
    const aCurrent = stamp(a.startsAt) <= now, bCurrent = stamp(b.startsAt) <= now
    return Number(bCurrent) - Number(aCurrent) || stamp(a.startsAt) - stamp(b.startsAt)
      || order.get(a.performerId)! - order.get(b.performerId)!
  }).slice(0, 8)
  const featured = ranked.slice(0, 10).map(p => p.id)
  return { ids: ranked.map(p => p.id), featured, upcoming, unscheduled: ranked.filter(p => !next.has(p.id)).map(p => p.id),
    recent: ranked.filter(p => !next.has(p.id) && !featured.includes(p.id)).slice(0, 8).map(p => p.id) }
}
/** Explicit Japan time avoids Safari's implementation-dependent bare-date parsing. */
export function slotTimestamp(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) return null
  const value = `${date}T${time.length === 5 ? time + ':00' : time}+09:00`
  return Number.isFinite(Date.parse(value)) ? value : null
}
