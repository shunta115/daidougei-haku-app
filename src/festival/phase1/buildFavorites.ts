import type { Performer } from '../types'
import { readFavorites } from '../lib/favoritesStorage'
import { nextSlotForPerformerFromNow } from '../lib/scheduleEngine'
import { getDemoNow } from '../lib/demoClock'
import type { Phase1FavoriteEntry } from './types'
import { mapTargetFromVenueId } from './buildHomeFeed'

/** 推し一覧用：localStorage の ID を演者 + 次回マップ先に解決 */
export function buildPhase1FavoriteEntries(
  performerById: (id: string) => Performer | undefined,
): Phase1FavoriteEntry[] {
  let ids: string[] = []
  try {
    ids = readFavorites()
  } catch (e) {
    if (import.meta.env.DEV) console.debug('[phase1] buildPhase1FavoriteEntries: readFavorites failed', e)
    return []
  }

  const now = getDemoNow()
  const out: Phase1FavoriteEntry[] = []

  for (const performerId of ids) {
    const performer = performerById(performerId)
    if (!performer) {
      if (import.meta.env.DEV) console.debug('[phase1] buildPhase1FavoriteEntries: performer missing', performerId)
      continue
    }
    const slot = nextSlotForPerformerFromNow(performerId, now)
    const mapTarget = slot
      ? mapTargetFromVenueId(slot.venueId, performerId)
      : mapTargetFromVenueId('main-lawn', performerId)

    out.push({ performerId, performer, mapTarget })
  }

  return out
}
