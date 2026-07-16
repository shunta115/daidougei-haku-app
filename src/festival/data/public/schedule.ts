import type { ScheduleSlot } from '../../types'

/**
 * 公開モードの公演枠。
 * date: YYYY-MM-DD / start,end: HH:mm（Asia/Tokyo 想定）
 * performerId / venueId は performers.ts / venues.ts の id と一致させること。
 * status: scheduled | live | next | delayed | cancelled | indoor_moved
 */
export const PUBLIC_SCHEDULE_SLOTS: ScheduleSlot[] = []

/** おすすめ出演者 ID（performers.ts の id） */
export const PUBLIC_TODAYS_PICK_IDS: readonly string[] = []

/** スポットライト ID */
export const PUBLIC_SPOTLIGHT_IDS: readonly string[] = []
