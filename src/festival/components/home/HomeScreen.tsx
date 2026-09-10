import { useSyncExternalStore } from 'react'
import type { Performer, ProgramPulse, VenueArea } from '../../types'
import { getCatalogSlots, getLiveCatalogVersion, isLiveCatalogHydrated, subscribeLiveCatalog } from '../../../catalog/liveCatalog'
import { HomeEventOverview, type HomeHeroStatus } from './HomeEventOverview'
import { HomeLiveMega } from './HomeLiveMega'
import { HomeOfficialEntry } from './HomeOfficialEntry'
import { HomeRecommendedRow } from './HomeRecommendedRow'
import { HomeStreamNow } from './HomeStreamNow'
import { HomeVenuePanel } from './HomeVenuePanel'
import { useLang } from '../../../i18n/LangProvider'
import { useTrackView } from '../../../platform/lib/track'
import { resolvePerformerPhotoUrl } from '../../lib/streamPresence'

export type HomeScreenProps = {
  liveStreamers: readonly Performer[]
  upcomingStreamers: readonly Performer[]
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer?: Performer
  nextPerformer?: Performer
  pickPerformers: readonly Performer[]
  hotVenue: VenueArea
  goVenueId: string
  onWatchStream: (performerId: string) => void
  onSupportStream: (performerId: string) => void
  onOpenDetail: (id: string) => void
  onOpenMap: () => void
  onNearShows: () => void
  onOpenTimetable: () => void
  onOpenPerformers?: () => void
  onOpenOshi: () => void
  onShare: () => void
  onStreamRegister: () => void
  onAdmin: () => void
  showStaffEntry?: boolean
  showStreamRegisterEntry?: boolean
}

export function HomeScreen({
  liveStreamers,
  upcomingStreamers: _upcomingStreamers,
  live,
  next,
  livePerformer,
  nextPerformer,
  pickPerformers,
  hotVenue,
  goVenueId: _goVenueId,
  onWatchStream,
  onSupportStream,
  onOpenDetail,
  onOpenMap,
  onNearShows,
  onOpenTimetable,
  onOpenPerformers,
  onOpenOshi: _onOpenOshi,
  onShare: _onShare,
  onStreamRegister,
  onAdmin,
  showStaffEntry,
  showStreamRegisterEntry,
}: HomeScreenProps) {
  const { t } = useLang()
  useTrackView('home_view')
  useSyncExternalStore(subscribeLiveCatalog, getLiveCatalogVersion, () => 0)
  const catalogReady = isLiveCatalogHydrated()
  const hasSchedule = getCatalogSlots().length > 0
  const hasLiveStream = liveStreamers.length > 0
  const hasVenueNow = Boolean(live && livePerformer)
  const status: HomeHeroStatus = hasLiveStream || hasVenueNow ? 'live' : hasSchedule || Boolean(next) ? 'now' : 'soon'

  const heroPhoto =
    resolvePerformerPhotoUrl(liveStreamers[0]?.photoUrl) ||
    resolvePerformerPhotoUrl(livePerformer?.photoUrl) ||
    resolvePerformerPhotoUrl(pickPerformers.find((p) => resolvePerformerPhotoUrl(p.photoUrl))?.photoUrl)

  const primaryLabel =
    status === 'live' ? t('heroWatchLive') : status === 'now' ? t('heroSeeNow') : t('heroSeeActs')

  const onPrimary = () => {
    if (hasLiveStream) {
      onWatchStream(liveStreamers[0]!.id)
      return
    }
    if (hasVenueNow && livePerformer) {
      onOpenDetail(livePerformer.id)
      return
    }
    if (status === 'now') {
      onNearShows()
      return
    }
    onOpenPerformers?.()
  }

  return (
    <main className="fe-main fe-main--home fe-main--launch">
      <HomeEventOverview
        heroPhotoUrl={heroPhoto}
        status={status}
        primaryLabel={primaryLabel}
        onPrimary={onPrimary}
        onOpenTimetable={onOpenTimetable}
      />

      {hasLiveStream ? (
        <HomeStreamNow
          livePerformers={liveStreamers}
          onWatch={onWatchStream}
          onSupport={onSupportStream}
          hideWhenEmpty
        />
      ) : null}

      {hasVenueNow || next ? (
        <HomeLiveMega
          live={live}
          next={next}
          livePerformer={livePerformer}
          nextPerformer={nextPerformer}
          onOpenDetail={onOpenDetail}
          onOpenMap={onNearShows}
        />
      ) : null}

      <HomeRecommendedRow performers={pickPerformers} onOpenDetail={onOpenDetail} />

      {catalogReady && !pickPerformers.length && !hasLiveStream ? (
        <p className="fe-home-empty" role="status">
          {t('comingSoonRoster')}
        </p>
      ) : null}

      <HomeVenuePanel venue={hotVenue} onOpenMap={onOpenMap} onNearShows={onNearShows} />

      <HomeOfficialEntry
        onStreamRegister={onStreamRegister}
        onAdmin={onAdmin}
        showStaffEntry={showStaffEntry}
        showStreamRegisterEntry={showStreamRegisterEntry}
      />
    </main>
  )
}
