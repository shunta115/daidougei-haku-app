import type { Performer, ProgramPulse, ScheduleSlot, VenueArea } from '../types'
import { SCHEDULE_SLOTS, VENUE_AREAS } from '../data/scheduleData'
import { formatTokyoDate, getDemoNow, tokyoWallDate } from './demoClock'
import { PREP_VENUE } from '../services/festivalRepository'

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

/** 開始時刻順（タイムテーブル一覧用） */
export function sortSlotsChronological(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => {
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
  return tokyoWallDate(slot.date, slot.start)
}

export function slotEndAsDate(slot: ScheduleSlot): Date {
  return tokyoWallDate(slot.date, slot.end)
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
  return formatTokyoDate(getDemoNow())
}

/** ダッシュボード用：LIVE 会場 → NEXT 会場 → 混雑が高いエリア */
export function hotVenueForDashboard(): VenueArea {
  const live = currentLiveSlot()
  if (live) return venueById(live.venueId) ?? VENUE_AREAS[0] ?? PREP_VENUE
  const next = currentNextSlot()
  if (next) return venueById(next.venueId) ?? VENUE_AREAS[0] ?? PREP_VENUE
  return VENUE_AREAS.find((v) => v.crowd === 'high') ?? VENUE_AREAS[0] ?? PREP_VENUE
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

/** 本日のスケジュール由来の雨天・変更アラート（運営メモは別途マージ） */
export function todayBuiltInScheduleAlerts(): string[] {
  const today = demoTodayDateString()
  const lines: string[] = []
  for (const s of slotsByDate(today)) {
    if (s.status === 'cancelled' || s.status === 'delayed' || s.status === 'indoor_moved') {
      const bit = s.noteJa ?? statusLabelJa(s.status)
      lines.push(`${s.stageJa} · ${bit}`)
    }
  }
  return lines
}

/** まもなく開演に入った最初の枠（回遊・通知UI用） */
export function firstStartsSoonSlot(
  performers: Performer[],
  now: Date = getDemoNow(),
): { slot: ScheduleSlot; performer: Performer } | undefined {
  const today = demoTodayDateString()
  for (const s of slotsByDate(today)) {
    if (derivedAudienceTimeStatus(s, now) !== 'starts_soon') continue
    const performer = performers.find((x) => x.id === s.performerId)
    if (performer) return { slot: s, performer }
  }
  return undefined
}

/** 開演までの分数（未開演: 正、開演後: 負） */
export function minutesBeforeSlotStart(slot: ScheduleSlot, now: Date): number {
  return (slotAsDate(slot).getTime() - now.getTime()) / 60_000
}

/**
 * 開演の N 分前以内の枠（未 LIVE・未終了）。ホーム「まもなく開始」レール用。
 * 中止・遅延・屋内移動は除外。
 */
export function slotsStartingWithinMinutes(
  performers: Performer[],
  now: Date = getDemoNow(),
  withinMinutes = 15,
): Array<{ slot: ScheduleSlot; performer: Performer }> {
  const today = demoTodayDateString()
  const out: Array<{ slot: ScheduleSlot; performer: Performer }> = []
  for (const slot of slotsByDate(today)) {
    if (slot.status === 'cancelled') continue
    const st = derivedAudienceTimeStatus(slot, now)
    if (st === 'live_now' || st === 'finished' || st === 'cancelled' || st === 'delayed' || st === 'moved') continue
    const mins = minutesBeforeSlotStart(slot, now)
    if (mins > 0 && mins <= withinMinutes) {
      const performer = performers.find((x) => x.id === slot.performerId)
      if (performer) out.push({ slot, performer })
    }
  }
  return out.sort((a, b) => slotAsDate(a.slot).getTime() - slotAsDate(b.slot).getTime())
}

/** 親コンポーネント用：まもなく開演チップの演者・ラベル */
export function computeSoonHint(performers: Performer[], now: Date = getDemoNow()) {
  const row = firstStartsSoonSlot(performers, now)
  if (!row) return { performer: undefined as Performer | undefined, label: undefined as string | undefined }
  const st = derivedAudienceTimeStatus(row.slot, now)
  return { performer: row.performer, label: audienceStatusLabelJa(st) }
}

