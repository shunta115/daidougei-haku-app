import type { ScheduleSlot } from '../../types'
import { SCHEDULE_SLOTS } from '../../data/scheduleData'
import { demoTodayDateString } from '../../lib/scheduleEngine'

/**
 * デモ「本日」の公演枠（既存 SCHEDULE_SLOTS から抽出）。
 * JSON 相当の静的リストとして hooks / Phase1 ページから参照可能。
 */
export const PHASE1_DEMO_DATE = '2026-11-08' as const

export const PHASE1_TODAY_SLOTS: readonly ScheduleSlot[] = SCHEDULE_SLOTS.filter(
  (s) => s.date === PHASE1_DEMO_DATE,
)

/** 運営マーク付きの NOW / NEXT 枠 ID（scheduleData の status と一致） */
export const PHASE1_PLAYBACK_ANCHORS = {
  liveSlotId: 'd2-live',
  nextSlotId: 'd2-next',
} as const

export function phase1SlotsForDate(date: string = demoTodayDateString()): ScheduleSlot[] {
  return SCHEDULE_SLOTS.filter((s) => s.date === date)
}
