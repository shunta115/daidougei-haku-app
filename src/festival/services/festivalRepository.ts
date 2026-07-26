import { isDemoMode, enableMockCrowdLevels } from '../config/runtimeConfig'
import { PUBLIC_EVENT_META } from '../data/public/eventMeta'
import type { Performer, ScheduleSlot, VenueArea } from '../types'

/**
 * 開催ヘッダー等の公開向け文言（実開催情報が未登録のときの安全表示）。
 */
export const PUBLIC_EVENT_COPY = {
  datesPending: '次回開催情報は準備中です',
  rosterPending: '出演情報は順次公開します',
  noLiveShows: '現在開催中の公演はありません',
  venuePending: '会場情報は準備中です',
  schedulePending: 'タイムテーブルは準備中です',
} as const

export const PREP_VENUE: VenueArea = {
  id: 'prep',
  nameJa: PUBLIC_EVENT_COPY.venuePending,
  nameEn: 'Venue TBA',
  blurbJa: PUBLIC_EVENT_COPY.datesPending,
  blurbEn: 'Next event details coming soon.',
  gradient: 'linear-gradient(160deg, #061018 0%, #0e1a28 50%, #1a3040 100%)',
}

export type EventHeaderMeta = {
  dateLabel: string
  placeLabel: string
  showLivePill: boolean
}

export function getEventHeaderMeta(hasActiveLiveShow: boolean): EventHeaderMeta {
  if (isDemoMode) {
    return {
      dateLabel: '11.07–11.09',
      placeLabel: 'みなとみらい',
      showLivePill: true,
    }
  }
  const dateLabel = PUBLIC_EVENT_META.dateLabel.trim() || PUBLIC_EVENT_COPY.datesPending
  const placeLabel = PUBLIC_EVENT_META.placeLabel.trim()
  return {
    dateLabel,
    placeLabel,
    showLivePill: PUBLIC_EVENT_META.allowLivePill && hasActiveLiveShow,
  }
}

export function sanitizeVenueCrowd(venues: VenueArea[]): VenueArea[] {
  if (enableMockCrowdLevels) return venues
  return venues.map((v) => {
    const { crowd: _crowd, ...rest } = v
    return rest
  })
}

export type FestivalCatalog = {
  performers: Performer[]
  venues: VenueArea[]
  slots: ScheduleSlot[]
  todaysPickIds: readonly string[]
  spotlightIds: readonly string[]
}
