import { useState } from 'react'
import type { Performer, ProgramPulse, VenueArea } from '../../types'
import type { TimetableScheduleMode } from '../../lib/timetableConstants'
import { EventStripHeader } from './EventStripHeader'
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
  onOpenOshi: () => void
  onShare: () => void
  onStreamRegister: () => void
  onAdmin: () => void
  showStaffEntry?: boolean
  showStreamRegisterEntry?: boolean
}

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
  onOpenOshi,
  onShare,
  onStreamRegister,
  onAdmin,
  showStaffEntry,
  showStreamRegisterEntry,
}: HomeScreenProps) {
  const [scheduleMode, setScheduleMode] = useState<TimetableScheduleMode>('normal')
  const rain = scheduleMode === 'rain'

  return (
    <main className={`fe-main fe-main--home fe-main--h6 fe-main--stream-home${rain ? ' fe-main--h6-rain' : ''}`}>
      <EventStripHeader onShare={onShare} hasActiveLiveShow={liveStreamers.length > 0 || Boolean(live)} />
      <HomeStreamNow livePerformers={liveStreamers} onWatch={onWatchStream} onSupport={onSupportStream} />
      {pickPerformers.length === 0 && liveStreamers.length === 0 && !live ? (
        <p className="fe-public-prep" role="status">
          出演情報は順次公開します。現在開催中の公演はありません。
        </p>
      ) : null}
      <HomeUpcomingStreams
        performers={upcomingStreamers}
        onOpen={onWatchStream}
        onOpenDetail={onOpenDetail}
      />

      <section className="fe-home-venue-block" aria-labelledby="fe-home-venue-title">
        <h2 id="fe-home-venue-title" className="fe-home-venue-block__title">
          会場の今
        </h2>
        <p className="fe-home-venue-block__sub">フェス現地のライブ · スケジュール · 混雑</p>
        <HomeLiveMega
          live={live}
          next={next}
          livePerformer={livePerformer}
          nextPerformer={nextPerformer}
          onOpenDetail={onOpenDetail}
          onOpenMap={onNearShows}
        />
        <HomeWeatherToggle mode={scheduleMode} onChange={setScheduleMode} />
        <HomeScheduleRail scheduleMode={scheduleMode} onOpenDetail={onOpenDetail} onOpenTimetable={onOpenTimetable} />
        <HomeCrowdStrip hotVenueId={goVenueId || hotVenue.id} onOpenMap={onOpenMap} />
      </section>

      <HomeRecommendedRow performers={pickPerformers} onOpenDetail={onOpenDetail} />
      <div className="fe-h6-maprow">
        <button type="button" className="fe-h6-maprow__primary" onClick={onNearShows}>
          近くのショーを探す
        </button>
        <button type="button" className="fe-h6-maprow__ghost" onClick={onOpenMap}>
          会場マップ
        </button>
      </div>
      <Reveal>
        <HomeTipsTeaser
          liveStreamers={liveStreamers}
          onOpenOshi={onOpenOshi}
          onWatchOshiLive={onWatchStream}
        />
      </Reveal>
      <HomeOfficialEntry
        onStreamRegister={onStreamRegister}
        onAdmin={onAdmin}
        showStaffEntry={showStaffEntry}
        showStreamRegisterEntry={showStreamRegisterEntry}
      />
    </main>
  )
}
