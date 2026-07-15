import type { Performer, ProgramPulse, VenueArea } from '../types'

/** MAP 導線のフォーカス先 */
export type Phase1MapTarget = {
  venueId: string
  venueNameJa: string
  venueNameEn: string
  performerId?: string
}

/** NOW PLAYING（scheduleEngine の live pulse ベース） */
export type Phase1NowPlaying = {
  kind: 'now'
  pulse: ProgramPulse
  performer: Performer
  venue: VenueArea
  mapTarget: Phase1MapTarget
  statusLabelJa: string
}

/** NEXT UP（scheduleEngine の next pulse ベース） */
export type Phase1NextUp = {
  kind: 'next'
  pulse: ProgramPulse
  performer: Performer
  venue: VenueArea
  mapTarget: Phase1MapTarget
  statusLabelJa: string
}

/** ホーム上部フィード束 */
export type Phase1HomeFeed = {
  nowPlaying: Phase1NowPlaying | null
  nextUp: Phase1NextUp | null
  defaultMapTarget: Phase1MapTarget
  favoritePerformerIds: string[]
}

/** 推し一覧1件（演者解決済み + 次回マップ先） */
export type Phase1FavoriteEntry = {
  performerId: string
  performer: Performer
  mapTarget: Phase1MapTarget
}

/** 時刻ベースの再生ステータス（将来 useScheduleStatus 用） */
export type Phase1ScheduleStatus =
  | 'live_now'
  | 'starts_soon'
  | 'upcoming'
  | 'finished'
  | 'cancelled'
  | 'delayed'
  | 'moved'

export type Phase1NavTarget = {
  kind: 'map' | 'performer' | 'timetable'
  venueId?: string
  performerId?: string
}

/** フラットカード用（将来の NowPlayingCard / NextUpCard コンポーネント向け） */
export type NowPlayingCardData = {
  slotId: string
  performerId: string
  performerName: string
  performerNameJa: string
  actJa: string
  stageJa: string
  venueId: string
  venueNameJa: string
  startTime: string
  endTime: string
  windowLabel: string
  status: Phase1ScheduleStatus
  nav: Phase1NavTarget
  photoUrl?: string
  gradient: string
}

export type NextUpCardData = {
  slotId: string
  performerId: string
  performerName: string
  performerNameJa: string
  actJa: string
  stageJa: string
  venueId: string
  venueNameJa: string
  startTime: string
  endTime: string
  windowLabel: string
  status: Phase1ScheduleStatus
  nav: Phase1NavTarget
  photoUrl?: string
  gradient: string
}

/** グリッド / SVG マップ用ピン */
export type MapVenuePin = {
  venueId: string
  nameJa: string
  nameEn: string
  blurbJa: string
  gradient: string
  mapRow: number
  mapCol: number
  crowd?: 'low' | 'mid' | 'high'
}

export type Phase1PlaybackBundle = {
  now: NowPlayingCardData | null
  next: NextUpCardData | null
  mapPins: MapVenuePin[]
  favoriteIds: string[]
}
