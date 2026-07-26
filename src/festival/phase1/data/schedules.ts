import { isDemoMode } from '../../config/runtimeConfig'
import type { ScheduleSlot } from '../../types'
import { SCHEDULE_SLOTS } from '../../data/scheduleData'
import { demoTodayDateString } from '../../lib/scheduleEngine'

/**
 * デモ「本日」日付。公開モードでは実時刻の東京日付を使う（枠が無い場合でも一貫）。
 */
export const PHASE1_DEMO_DATE = isDemoMode ? ('2026-11-08' as const) : demoTodayDateString()

export const PHASE1_TODAY_SLOTS: readonly ScheduleSlot[] = SCHEDULE_SLOTS.filter(
  (s) => s.date === PHASE1_DEMO_DATE,
)

/** 運営マーク付きの NOW / NEXT 枠 ID（scheduleData の status と一致）。公開は空データのため参照されない。 */
export const PHASE1_PLAYBACK_ANCHORS = {
  liveSlotId: 'd2-live',
  nextSlotId: 'd2-next',
} as const

export function phase1SlotsForDate(date: string = demoTodayDateString()): ScheduleSlot[] {
  return SCHEDULE_SLOTS.filter((s) => s.date === date)
}
