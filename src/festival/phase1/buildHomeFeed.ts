import type { Performer, ProgramPulse } from '../types'
import { buildMarkedPulses, hotVenueForDashboard, venueById } from '../lib/scheduleEngine'
import { readFavorites } from '../lib/favoritesStorage'
import type { Phase1HomeFeed, Phase1MapTarget, Phase1NextUp, Phase1NowPlaying } from './types'

export function mapTargetFromPulse(pulse: ProgramPulse, performer?: Performer): Phase1MapTarget {
  const venueId = pulse.venueId ?? ''
  const venue = venueId ? venueById(venueId) : undefined
  return {
    venueId: venue?.id ?? venueId,
    venueNameJa: venue?.nameJa ?? pulse.venueJa,
    venueNameEn: venue?.nameEn ?? pulse.venueEn,
    performerId: performer?.id ?? pulse.performerId,
  }
}

export function mapTargetFromVenueId(venueId: string, performerId?: string): Phase1MapTarget {
  const venue = venueById(venueId)
  return {
    venueId,
    venueNameJa: venue?.nameJa ?? venueId,
    venueNameEn: venue?.nameEn ?? venueId,
    performerId,
  }
}

function buildNowPlaying(pulse: ProgramPulse, performer: Performer): Phase1NowPlaying {
  const venue = venueById(pulse.venueId ?? '')
  if (!venue) {
    if (import.meta.env.DEV) console.debug('[phase1] buildNowPlaying: venue not found', { venueId: pulse.venueId, slotId: pulse.id })
  }
  return {
    kind: 'now',
    pulse,
    performer,
    venue: venue ?? {
      id: pulse.venueId ?? 'unknown',
      nameJa: pulse.venueJa,
      nameEn: pulse.venueEn,
      blurbJa: '',
      blurbEn: '',
      gradient: 'linear-gradient(160deg, #0a0a0a, #1a1a2e)',
    },
    mapTarget: mapTargetFromPulse(pulse, performer),
    statusLabelJa: pulse.windowJa || 'LIVE',
  }
}

function buildNextUp(pulse: ProgramPulse, performer: Performer): Phase1NextUp {
  const venue = venueById(pulse.venueId ?? '')
  if (!venue) {
    if (import.meta.env.DEV) console.debug('[phase1] buildNextUp: venue not found', { venueId: pulse.venueId, slotId: pulse.id })
  }
  return {
    kind: 'next',
    pulse,
    performer,
    venue: venue ?? {
      id: pulse.venueId ?? 'unknown',
      nameJa: pulse.venueJa,
      nameEn: pulse.venueEn,
      blurbJa: '',
      blurbEn: '',
      gradient: 'linear-gradient(160deg, #0a0a0a, #1a1a2e)',
    },
    mapTarget: mapTargetFromPulse(pulse, performer),
    statusLabelJa: pulse.windowJa || 'NEXT',
  }
}

/**
 * NOW PLAYING / NEXT UP / お気に入り ID / マップ初期先をまとめて返す。
 * 既存の scheduleEngine + data.ts をそのまま利用する。
 */
export function buildPhase1HomeFeed(performers: Performer[], performerById: (id: string) => Performer | undefined): Phase1HomeFeed {
  const { live, next } = buildMarkedPulses(performers)
  const hot = hotVenueForDashboard()

  let nowPlaying: Phase1NowPlaying | null = null
  if (live) {
    const p = performerById(live.performerId)
    if (p) nowPlaying = buildNowPlaying(live, p)
    else if (import.meta.env.DEV) console.debug('[phase1] buildPhase1HomeFeed: live performer missing', live.performerId)
  }

  let nextUp: Phase1NextUp | null = null
  if (next) {
    const p = performerById(next.performerId)
    if (p) nextUp = buildNextUp(next, p)
    else if (import.meta.env.DEV) console.debug('[phase1] buildPhase1HomeFeed: next performer missing', next.performerId)
  }

  const defaultMapTarget =
    nowPlaying?.mapTarget ??
    nextUp?.mapTarget ??
    mapTargetFromVenueId(hot.id)

  let favoritePerformerIds: string[] = []
  try {
    favoritePerformerIds = readFavorites()
  } catch (e) {
    if (import.meta.env.DEV) console.debug('[phase1] buildPhase1HomeFeed: readFavorites failed', e)
  }

  return {
    nowPlaying,
    nextUp,
    defaultMapTarget,
    favoritePerformerIds,
  }
}
