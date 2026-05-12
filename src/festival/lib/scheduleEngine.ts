import type { Performer, ProgramPulse, ScheduleSlot, VenueArea } from '../types'
import { SCHEDULE_SLOTS, VENUE_AREAS } from '../data/scheduleData'
import { getDemoNow } from './demoClock'

export function venueById(id: string): VenueArea | undefined {
  return VENUE_AREAS.find((v) => v.id === id)
}

export function slotToPulse(slot: ScheduleSlot, performers: Performer[]): ProgramPulse | null {
  const v = venueById(slot.venueId)
  const p = performers.find((x) => x.id === slot.performerId)
  if (!v || !p) return null
  return {
    id: slot.id,
    mode: slot.status === 'live' ? 'live' : 'next',
    performerId: slot.performerId,
    venueId: slot.venueId,
    venueJa: v.nameJa,
    venueEn: v.nameEn,
    stageJa: slot.stageJa,
    stageEn: slot.stageEn,
    windowJa: slot.windowJa ?? (slot.status === 'live' ? 'LIVE' : 'NEXT'),
    windowEn: slot.windowEn ?? (slot.status === 'live' ? 'LIVE' : 'NEXT'),
  }
}

export function buildMarkedPulses(performers: Performer[]): {
  live: ProgramPulse | null
  next: ProgramPulse | null
} {
  const liveSlot = SCHEDULE_SLOTS.find((s) => s.status === 'live')
  const nextSlot = SCHEDULE_SLOTS.find((s) => s.status === 'next')
  return {
    live: liveSlot ? slotToPulse(liveSlot, performers) : null,
    next: nextSlot ? slotToPulse(nextSlot, performers) : null,
  }
}

export function slotsSorted(): ScheduleSlot[] {
  return [...SCHEDULE_SLOTS].sort((a, b) => {
    const da = a.date.localeCompare(b.date)
    if (da !== 0) return da
    return a.start.localeCompare(b.start)
  })
}

export function slotsByDate(date: string) {
  return slotsSorted().filter((s) => s.date === date)
}

export function slotsByVenue(venueId: string) {
  return slotsSorted().filter((s) => s.venueId === venueId)
}

export function slotsByPerformer(performerId: string) {
  return slotsSorted().filter((s) => s.performerId === performerId)
}

export function uniqueScheduleDates() {
  return Array.from(new Set(SCHEDULE_SLOTS.map((s) => s.date))).sort()
}

export function nextHighlightSlotId(): string | null {
  const n = SCHEDULE_SLOTS.find((s) => s.status === 'next')
  return n?.id ?? null
}

export function statusLabelJa(status: ScheduleSlot['status']) {
  switch (status) {
    case 'scheduled':
      return '予定'
    case 'live':
      return '開演中'
    case 'next':
      return '次演目'
    case 'delayed':
      return '遅延'
    case 'cancelled':
      return '中止'
    case 'indoor_moved':
      return '屋内移動'
    default:
      return status
  }
}

export function statusLabelEn(status: ScheduleSlot['status']) {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'live':
      return 'Live'
    case 'next':
      return 'Next'
    case 'delayed':
      return 'Delayed'
    case 'cancelled':
      return 'Cancelled'
    case 'indoor_moved':
      return 'Moved indoor'
    default:
      return status
  }
}

export function liveSlotIdsForVenue(venueId: string): Set<string> {
  const ids = new Set<string>()
  for (const s of SCHEDULE_SLOTS) {
    if (s.venueId === venueId && s.status === 'live') ids.add(s.id)
  }
  return ids
}

/** エリア別「次演目」スロット（ステータス next のみ） */
export function nextSlotIdsForVenue(venueId: string): Set<string> {
  const ids = new Set<string>()
  for (const s of SCHEDULE_SLOTS) {
    if (s.venueId === venueId && s.status === 'next') ids.add(s.id)
  }
  return ids
}

export function currentLiveSlot(): ScheduleSlot | undefined {
  return SCHEDULE_SLOTS.find((s) => s.status === 'live')
}

export function currentNextSlot(): ScheduleSlot | undefined {
  return SCHEDULE_SLOTS.find((s) => s.status === 'next')
}

export function slotAsDate(slot: ScheduleSlot): Date {
  const [y, m, d] = slot.date.split('-').map(Number)
  const [hh, mm] = slot.start.split(':').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0)
}

export function slotEndAsDate(slot: ScheduleSlot): Date {
  const [y, m, d] = slot.date.split('-').map(Number)
  const [hh, mm] = slot.end.split(':').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0)
}

export type AudienceTimeStatus =
  | 'live_now'
  | 'starts_soon'
  | 'upcoming'
  | 'finished'
  | 'cancelled'
  | 'delayed'
  | 'moved'

/** 現在地・時刻ベースの観客向けステータス（データ上の cancelled 等と合成） */
export function derivedAudienceTimeStatus(slot: ScheduleSlot, now: Date): AudienceTimeStatus {
  if (slot.status === 'cancelled') return 'cancelled'
  if (slot.status === 'delayed') return 'delayed'
  if (slot.status === 'indoor_moved') return 'moved'
  const start = slotAsDate(slot)
  const end = slotEndAsDate(slot)
  if (now > end) return 'finished'
  if (now >= start && now <= end) return 'live_now'
  const soonMs = 45 * 60 * 1000
  if (now < start && start.getTime() - now.getTime() <= soonMs) return 'starts_soon'
  return 'upcoming'
}

function rankForSort(s: AudienceTimeStatus): number {
  switch (s) {
    case 'live_now':
      return 0
    case 'starts_soon':
      return 1
    case 'delayed':
      return 1
    case 'upcoming':
      return 2
    case 'moved':
      return 2
    case 'cancelled':
      return 4
    case 'finished':
      return 5
    default:
      return 3
  }
}

export function sortSlotsForLiveView(slots: ScheduleSlot[], now: Date): ScheduleSlot[] {
  return [...slots].sort((a, b) => {
    const ra = rankForSort(derivedAudienceTimeStatus(a, now))
    const rb = rankForSort(derivedAudienceTimeStatus(b, now))
    if (ra !== rb) return ra - rb
    return slotAsDate(a).getTime() - slotAsDate(b).getTime()
  })
}

export function audienceStatusLabelJa(s: AudienceTimeStatus): string {
  switch (s) {
    case 'live_now':
      return 'LIVE NOW'
    case 'starts_soon':
      return 'まもなく開演'
    case 'upcoming':
      return '開演予定'
    case 'finished':
      return '終了'
    case 'cancelled':
      return '中止'
    case 'delayed':
      return '遅延'
    case 'moved':
      return '移動'
    default:
      return s
  }
}

export function audienceStatusLabelEn(s: AudienceTimeStatus): string {
  switch (s) {
    case 'live_now':
      return 'LIVE NOW'
    case 'starts_soon':
      return 'STARTS SOON'
    case 'upcoming':
      return 'UPCOMING'
    case 'finished':
      return 'FINISHED'
    case 'cancelled':
      return 'CANCELLED'
    case 'delayed':
      return 'DELAYED'
    case 'moved':
      return 'MOVED'
    default:
      return s
  }
}

export function demoTodayDateString(): string {
  const d = getDemoNow()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** ダッシュボード用：LIVE 会場 → NEXT 会場 → 混雑が高いエリア */
export function hotVenueForDashboard(): VenueArea {
  const live = currentLiveSlot()
  if (live) return venueById(live.venueId) ?? VENUE_AREAS[0]!
  const next = currentNextSlot()
  if (next) return venueById(next.venueId) ?? VENUE_AREAS[0]!
  return VENUE_AREAS.find((v) => v.crowd === 'high') ?? VENUE_AREAS[0]!
}

export function topHeatPerformerId(performers: Performer[]): string | undefined {
  if (!performers.length) return undefined
  return [...performers].sort((a, b) => b.heat - a.heat)[0]?.id
}

/** パフォーマーの「このあと」— デモ日時点で未終了の最初の枠 */
export function nextSlotForPerformerFromNow(performerId: string, now: Date): ScheduleSlot | undefined {
  const mine = slotsSorted().filter((s) => s.performerId === performerId)
  return mine.find((s) => slotEndAsDate(s) >= now)
}

export function todaySlotsForPerformer(performerId: string, today: string): ScheduleSlot[] {
  return slotsSorted().filter((s) => s.performerId === performerId && s.date === today)
}

export function uniqueGenresFromPerformers(performers: Performer[]): string[] {
  const g = new Set<string>()
  for (const p of performers) {
    if (p.genre?.trim()) g.add(p.genre.trim())
  }
  return [...g].sort((a, b) => a.localeCompare(b, 'ja'))
}

