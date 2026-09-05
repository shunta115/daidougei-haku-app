import { useState, useSyncExternalStore } from 'react'
import type { Performer, ProgramPulse, VenueArea } from '../../types'
import type { TimetableScheduleMode } from '../../lib/timetableConstants'
import { isPublicMode } from '../../config/runtimeConfig'
import { getCatalogSlots, getLiveCatalogVersion, subscribeLiveCatalog } from '../../../catalog/liveCatalog'
import { EventStripHeader } from './EventStripHeader'
import { HomeEventOverview } from './HomeEventOverview'
import { HomeCrowdStrip } from './HomeCrowdStrip'
import { HomeLiveMega } from './HomeLiveMega'
import { HomeOfficialEntry } from './HomeOfficialEntry'
import { HomeRecommendedRow } from './HomeRecommendedRow'
import { HomeScheduleRail } from './HomeScheduleRail'
import { HomeStreamNow } from './HomeStreamNow'
import { HomeUpcomingStreams } from './HomeUpcomingStreams'
import { HomeWeatherToggle } from './HomeWeatherToggle'
import { HomeTipsTeaser } from './HomeTipsTeaser'
import { Reveal } from '../Reveal'
import { useLang } from '../../../i18n/LangProvider'
import { HomeVoteStrip } from './HomeVoteStrip'
import { useTrackView } from '../../../platform/lib/track'

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

/**
 * 公開β向け優先順:
 * 開催状況 → 次の公演 → 開催中 → 今日の公演 → 出演者 → マップ → 推し → 補助
 */
export function HomeScreen({
  liveStreamers,
  upcomingStreamers,
  live,
  next,
  livePerformer,
  nextPerformer,
  pickPerformers,
  hotVenue,
  goVenueId,
  onWatchStream,
  onSupportStream,
  onOpenDetail,
  onOpenMap,
  onNearShows,
  onOpenTimetable,
  onOpenPerformers,
  onOpenOshi,
  onShare,
  onStreamRegister,
  onAdmin,
  showStaffEntry,
  showStreamRegisterEntry,
}: HomeScreenProps) {
  const [scheduleMode, setScheduleMode] = useState<TimetableScheduleMode>('normal')
  const { t } = useLang()
  useTrackView('view_home')
  useSyncExternalStore(subscribeLiveCatalog, getLiveCatalogVersion, () => 0)
  const rain = scheduleMode === 'rain'
  const hasVenuePulse = Boolean(live || next)
  const hasSchedule = getCatalogSlots().length > 0
  const hasAnyContent = hasVenuePulse || liveStreamers.length > 0 || pickPerformers.length > 0
  const showStreamBlock = liveStreamers.length > 0
  const showUpcoming = upcomingStreamers.length > 0
  const showVenueBlock = hasVenuePulse || hasSchedule

  return (
    <main className={`fe-main fe-main--home fe-main--h6 fe-main--stream-home${rain ? ' fe-main--h6-rain' : ''}`}>
      {/* 1. 開催状況 */}
      <EventStripHeader onShare={onShare} hasActiveLiveShow={liveStreamers.length > 0 || Boolean(live)} />
      <HomeEventOverview onOpenTimetable={onOpenTimetable} onOpenPerformers={onOpenPerformers} />
      {hasSchedule ? <HomeWeatherToggle mode={scheduleMode} onChange={setScheduleMode} /> : null}

      {!hasAnyContent ? (
        <p className="fe-public-prep" role="status">
          {t('comingSoonRoster')} {t('noLiveNow')}
        </p>
      ) : null}

      {showVenueBlock ? (
        <section className="fe-home-venue-block" aria-labelledby="fe-home-venue-title">
          <h2 id="fe-home-venue-title" className="fe-home-venue-block__title">
            {t('venueNow')}
          </h2>
          <p className="fe-home-venue-block__sub">
            {isPublicMode && !hasVenuePulse
              ? t('comingSoonSchedule')
              : 'フェス現地のライブ · スケジュール · 混雑'}
          </p>
          <HomeLiveMega
            live={live}
            next={next}
            livePerformer={livePerformer}
            nextPerformer={nextPerformer}
            onOpenDetail={onOpenDetail}
            onOpenMap={onNearShows}
          />
          {hasSchedule ? (
            <HomeScheduleRail scheduleMode={scheduleMode} onOpenDetail={onOpenDetail} onOpenTimetable={onOpenTimetable} />
          ) : null}
        </section>
      ) : null}

      {/* 配信LIVEは会場LIVEと重複しやすいため、実データがあるときのみ */}
      {showStreamBlock ? (
        <HomeStreamNow
          livePerformers={liveStreamers}
          onWatch={onWatchStream}
          onSupport={onSupportStream}
          hideWhenEmpty
        />
      ) : null}
      {showUpcoming ? (
        <HomeUpcomingStreams
          performers={upcomingStreamers}
          onOpen={onWatchStream}
          onOpenDetail={onOpenDetail}
        />
      ) : null}

      <HomeVoteStrip />

      {/* 5. 出演者を探す */}
      <HomeRecommendedRow performers={pickPerformers} onOpenDetail={onOpenDetail} />
      {onOpenPerformers ? (
        <div className="fe-h6-maprow">
          <button type="button" className="fe-h6-maprow__primary" onClick={onOpenPerformers}>
            {t('findActs')}
          </button>
          <button type="button" className="fe-h6-maprow__ghost" onClick={onOpenTimetable}>
            {t('timetableTitle')}
          </button>
        </div>
      ) : null}

      {/* 6. 会場マップ */}
      <div className="fe-h6-maprow">
        <button type="button" className="fe-h6-maprow__primary" onClick={onOpenMap}>
          {t('openMap')}
        </button>
        <button type="button" className="fe-h6-maprow__ghost" onClick={onNearShows}>
          {t('mapTitle')}
        </button>
      </div>
      <p className="fe-home-loc-note" role="note">
        {t('geoHint')}
      </p>

      {/* 7. 推し */}
      <Reveal>
        <HomeTipsTeaser
          liveStreamers={liveStreamers}
          onOpenOshi={onOpenOshi}
          onWatchOshiLive={onWatchStream}
        />
      </Reveal>

      {/* 8. 補助 */}
      <HomeCrowdStrip hotVenueId={goVenueId || hotVenue.id} onOpenMap={onOpenMap} />
      <HomeOfficialEntry
        onStreamRegister={onStreamRegister}
        onAdmin={onAdmin}
        showStaffEntry={showStaffEntry}
        showStreamRegisterEntry={showStreamRegisterEntry}
      />
    </main>
  )
}
