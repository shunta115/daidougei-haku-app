import { getDemoNow } from './demoClock'
import { demoTodayDateString, slotAsDate, slotsByPerformer } from './scheduleEngine'

/** 一覧カード用の出演予定ラベル */
export function formatPerformerScheduleSummary(performerId: string): string {
  const now = getDemoNow()
  const today = demoTodayDateString()
  const all = slotsByPerformer(performerId)
  const todaySlots = all.filter((s) => s.date === today)

  if (todaySlots.length) {
    const first = todaySlots[0]!
    const extra = todaySlots.length > 1 ? ` · 他${todaySlots.length - 1}枠` : ''
    return `本日 ${first.start}–${first.end} · ${first.stageJa}${extra}`
  }

  const upcoming = all.find((s) => slotAsDate(s) >= now)
  if (upcoming) {
    const md = upcoming.date.slice(5).replace('-', '/')
    return `${md} ${upcoming.start}–${upcoming.end} · ${upcoming.stageJa}`
  }

  const last = all[all.length - 1]
  if (last) {
    return `最終 ${last.date.slice(5)} ${last.start}–${last.end} · ${last.stageJa}`
  }

  return '出演予定はタイムテーブルで確認'
}
