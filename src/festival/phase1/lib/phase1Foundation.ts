import type { Performer, ScheduleSlot } from '../../types'
import { performerById } from '../../data'
import { readFavorites } from '../../lib/favoritesStorage'
import {
  buildMarkedPulses,
  currentLiveSlot,
  currentNextSlot,
  derivedAudienceTimeStatus,
  demoTodayDateString,
  slotAsDate,
  slotEndAsDate,
} from '../../lib/scheduleEngine'
import { getDemoNow } from '../../lib/demoClock'
import { buildPhase1MapPins } from '../data/stages'
import type {
  NextUpCardData,
  NowPlayingCardData,
  Phase1PlaybackBundle,
  Phase1ScheduleStatus,
} from '../types'

function toPhase1Status(slot: ScheduleSlot, now: Date): Phase1ScheduleStatus {
  const st = derivedAudienceTimeStatus(slot, now)
  if (st === 'live_now') return 'live_now'
  if (st === 'starts_soon') return 'starts_soon'
  if (st === 'finished') return 'finished'
  if (st === 'cancelled') return 'cancelled'
  if (st === 'delayed') return 'delayed'
  if (st === 'moved') return 'moved'
  return 'upcoming'
}

function pulseToNowCard(
  pulse: NonNullable<ReturnType<typeof buildMarkedPulses>['live']>,
  performer: Performer,
  now: Date,
): NowPlayingCardData {
  const slot = currentLiveSlot()
  return {
    slotId: pulse.id,
    performerId: performer.id,
    performerName: performer.name,
    performerNameJa: performer.nameJa,
    actJa: performer.actJa,
    stageJa: pulse.stageJa,
    venueId: pulse.venueId ?? '',
    venueNameJa: pulse.venueJa,
    startTime: slot?.start ?? '',
    endTime: slot?.end ?? '',
    windowLabel: pulse.windowJa,
    status: slot ? toPhase1Status(slot, now) : 'live_now',
    nav: { kind: 'map', venueId: pulse.venueId, performerId: performer.id },
    photoUrl: performer.photoUrl,
    gradient: performer.gradient,
  }
}

function pulseToNextCard(
  pulse: NonNullable<ReturnType<typeof buildMarkedPulses>['next']>,
  performer: Performer,
  now: Date,
): NextUpCardData {
  const slot = currentNextSlot()
  return {
    slotId: pulse.id,
    performerId: performer.id,
    performerName: performer.name,
    performerNameJa: performer.nameJa,
    actJa: performer.actJa,
    stageJa: pulse.stageJa,
    venueId: pulse.venueId ?? '',
    venueNameJa: pulse.venueJa,
    startTime: slot?.start ?? '',
    endTime: slot?.end ?? '',
    windowLabel: pulse.windowJa,
    status: slot ? toPhase1Status(slot, now) : 'upcoming',
    nav: { kind: 'map', venueId: pulse.venueId, performerId: performer.id },
    photoUrl: performer.photoUrl,
    gradient: performer.gradient,
  }
}

/** NOW PLAYING 用データ（なければ null） */
export function buildNowPlayingCard(performers: Performer[]): NowPlayingCardData | null {
  const now = getDemoNow()
  const { live } = buildMarkedPulses(performers)
  if (!live) {
    console.log('[phase1] buildNowPlayingCard: no live pulse in schedule')
    return null
  }
  const performer = performers.find((p) => p.id === live.performerId) ?? performerById(live.performerId)
  if (!performer) {
    console.log('[phase1] buildNowPlayingCard: performer missing', live.performerId)
    return null
  }
  const slot = currentLiveSlot()
  if (slot && slotEndAsDate(slot) < now) {
    console.log('[phase1] buildNowPlayingCard: live slot already ended', slot.id)
    return null
  }
  return pulseToNowCard(live, performer, now)
}

/** NEXT UP 用データ（なければ null） */
export function buildNextUpCard(performers: Performer[]): NextUpCardData | null {
  const now = getDemoNow()
  const { next } = buildMarkedPulses(performers)
  if (!next) {
    console.log('[phase1] buildNextUpCard: no next pulse in schedule')
    return null
  }
  const performer = performers.find((p) => p.id === next.performerId) ?? performerById(next.performerId)
  if (!performer) {
    console.log('[phase1] buildNextUpCard: performer missing', next.performerId)
    return null
  }
  const slot = currentNextSlot()
  if (slot && slotAsDate(slot) < now) {
    console.log('[phase1] buildNextUpCard: next slot already started', slot.id)
    return null
  }
  return pulseToNextCard(next, performer, now)
}

/** 推し ID 一覧（localStorage · 既存 favoritesStorage） */
export function readPhase1FavoriteIds(): string[] {
  try {
    return readFavorites()
  } catch (e) {
    console.log('[phase1] readPhase1FavoriteIds: storage read failed', e)
    return []
  }
}

/** NOW / NEXT / MAP / 推し をまとめて取得 */
export function loadPhase1PlaybackBundle(performers: Performer[]): Phase1PlaybackBundle {
  void demoTodayDateString()
  return {
    now: buildNowPlayingCard(performers),
    next: buildNextUpCard(performers),
    mapPins: buildPhase1MapPins(),
    favoriteIds: readPhase1FavoriteIds(),
  }
}
