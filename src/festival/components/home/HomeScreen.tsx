import { type CSSProperties, useMemo, useSyncExternalStore } from 'react'
import type { Performer, ProgramPulse, VenueArea } from '../../types'
import { getCatalogSlots, getLiveCatalogVersion, subscribeLiveCatalog } from '../../../catalog/liveCatalog'
import { HomeLiveMega } from './HomeLiveMega'
import { HomeOfficialEntry } from './HomeOfficialEntry'
import { HomeRecommendedRow } from './HomeRecommendedRow'
import { HomeStreamNow } from './HomeStreamNow'
import { HomeVenuePanel } from './HomeVenuePanel'
import { useLang } from '../../../i18n/LangProvider'
import { useTrackView } from '../../../platform/lib/track'
import { initials } from '../../lib/initials'
import { formatPerformerScheduleSummary } from '../../lib/performerScheduleLabel'
import { canWatchLiveStream } from '../../lib/productionGuard'
import { resolvePerformerPhotoUrl, shouldShowAsLiveStream } from '../../lib/streamPresence'

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
  const { lang } = useLang()
  useTrackView('home_view')
  useSyncExternalStore(subscribeLiveCatalog, getLiveCatalogVersion, () => 0)
  const hasSchedule = getCatalogSlots().length > 0
  const hasLiveStream = liveStreamers.length > 0
  const hasVenueNow = Boolean(live && livePerformer)
  const heroPerformer = liveStreamers[0] ?? livePerformer ?? pickPerformers[0] ?? nextPerformer
  const heroPhoto = resolvePerformerPhotoUrl(heroPerformer?.photoUrl)
  const heroLive = Boolean(heroPerformer && (liveStreamers.some((p) => p.id === heroPerformer.id) || shouldShowAsLiveStream(heroPerformer)))
  const heroSchedule = heroPerformer ? formatPerformerScheduleSummary(heroPerformer.id) : null
  const heroWatchable = heroPerformer ? canWatchLiveStream(heroPerformer) : false
  const heroGenre = heroPerformer
    ? lang === 'ja'
      ? heroPerformer.actJa || heroPerformer.genre
      : heroPerformer.genre || heroPerformer.actJa
    : ''
  const labels = {
    featured: lang === 'ja' ? '注目パフォーマー' : 'Featured performer',
    discovery: lang === 'ja' ? '探す' : 'Discovery',
    event: lang === 'ja' ? 'イベント' : 'Event',
  }
  const discoveryRows = useMemo(() => {
    const seen = new Set<string>()
    return [liveStreamers, livePerformer ? [livePerformer] : [], pickPerformers, nextPerformer ? [nextPerformer] : []]
      .flat()
      .filter((p): p is Performer => Boolean(p))
      .filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })
      .slice(0, 8)
  }, [liveStreamers, livePerformer, nextPerformer, pickPerformers])

  const onPrimary = () => {
    if (heroPerformer && heroWatchable) {
      onWatchStream(heroPerformer.id)
      return
    }
    if (heroPerformer) {
      onOpenDetail(heroPerformer.id)
      return
    }
    if (hasSchedule || next) {
      onNearShows()
      return
    }
    onOpenPerformers?.()
  }

  return (
    <main className="fe-main fe-main--home fe-main--launch fe-main--creator-economy">
      {heroPerformer ? (
        <section
          className={`fe-creator-hero${heroPhoto ? ' fe-creator-hero--photo' : ''}${heroLive ? ' fe-creator-hero--live' : ''}`}
          style={
            heroPhoto
              ? ({ '--fe-creator-photo': `url(${heroPhoto})`, '--fe-creator-grad': heroPerformer.gradient } as CSSProperties)
              : ({ '--fe-creator-grad': heroPerformer.gradient } as CSSProperties)
          }
          aria-labelledby="fe-creator-hero-title"
        >
          <div className="fe-creator-hero__media" aria-hidden="true">
            {!heroPhoto ? <span>{initials(heroPerformer.nameJa || heroPerformer.name)}</span> : null}
          </div>
          <div className="fe-creator-hero__shade" aria-hidden="true" />
          <div className="fe-creator-hero__content">
            <p className="fe-creator-hero__brand">大道芸博</p>
            <p className="fe-creator-hero__signal">
              <span className="fe-creator-hero__live-dot" aria-hidden="true" />
              {heroLive ? 'LIVE NOW' : labels.featured}
            </p>
            <h1 id="fe-creator-hero-title" className="fe-creator-hero__name">
              {heroPerformer.nameJa || heroPerformer.name}
            </h1>
            <p className="fe-creator-hero__genre">{heroGenre}</p>
            <p className="fe-creator-hero__why">
              {heroLive
                ? 'いま、この瞬間のパフォーマンスを無料で視聴できます。'
                : heroSchedule || '気になる才能を見つけて、LIVE前にフォローできます。'}
            </p>
            <div className="fe-creator-hero__actions" aria-label="パフォーマーアクション">
              <button type="button" className="fe-creator-hero__cta" onClick={onPrimary}>
                {heroWatchable ? 'LIVEを見る' : 'プロフィールを見る'}
              </button>
              <button type="button" className="fe-creator-hero__follow" onClick={() => onOpenDetail(heroPerformer.id)}>
                フォロー
              </button>
              <button type="button" className="fe-creator-hero__support" onClick={() => onSupportStream(heroPerformer.id)}>
                ❤️ 応援する
              </button>
            </div>
            <p className="fe-creator-hero__proof">
              ❤️ {heroPerformer.likes.toLocaleString('ja-JP')}人が応援 · {heroPerformer.country || heroPerformer.locale}
            </p>
          </div>
        </section>
      ) : (
        <section className="fe-creator-hero fe-creator-hero--empty" aria-labelledby="fe-creator-hero-title">
          <div className="fe-creator-hero__content">
            <p className="fe-creator-hero__brand">大道芸博</p>
            <p className="fe-creator-hero__signal">{labels.discovery}</p>
            <h1 id="fe-creator-hero-title" className="fe-creator-hero__name">
              パフォーマー準備中
            </h1>
            <p className="fe-creator-hero__why">公開済みの出演者が入り次第、ここに表示されます。</p>
            <button type="button" className="fe-creator-hero__cta" onClick={onOpenPerformers}>
              探す
            </button>
          </div>
        </section>
      )}

      {discoveryRows.length > 0 ? (
        <section className="fe-discovery-strip" aria-label="注目パフォーマー">
          <div className="fe-discovery-strip__head">
            <p>注目のパフォーマー</p>
            <button type="button" onClick={onOpenPerformers}>
              すべて見る
            </button>
          </div>
          <div className="fe-discovery-strip__rail" role="list">
            {discoveryRows.map((p) => {
              const photo = resolvePerformerPhotoUrl(p.photoUrl)
              const liveNow = shouldShowAsLiveStream(p)
              return (
                <article key={p.id} className="fe-person-card" role="listitem">
                  <button type="button" className="fe-person-card__media" onClick={() => onOpenDetail(p.id)}>
                    {photo ? <img src={photo} alt="" loading="lazy" /> : <span>{initials(p.nameJa || p.name)}</span>}
                    {liveNow ? <em>LIVE</em> : null}
                  </button>
                  <div className="fe-person-card__body">
                    <button type="button" className="fe-person-card__name" onClick={() => onOpenDetail(p.id)}>
                      {p.nameJa || p.name}
                    </button>
                    <p>{lang === 'ja' ? p.actJa || p.genre : p.genre || p.actJa}</p>
                    <small>{formatPerformerScheduleSummary(p.id)}</small>
                    <div className="fe-person-card__actions">
                      <button type="button" onClick={() => (canWatchLiveStream(p) ? onWatchStream(p.id) : onOpenDetail(p.id))}>
                        見る
                      </button>
                      <button type="button" onClick={() => onOpenDetail(p.id)}>
                        フォロー
                      </button>
                      <button type="button" onClick={() => onSupportStream(p.id)}>
                        応援
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

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

      <HomeRecommendedRow performers={pickPerformers} onOpenDetail={onOpenDetail} onSupport={onSupportStream} onWatch={onWatchStream} />

      <section className="fe-event-brief" aria-label="イベント情報">
        <div>
          <p className="fe-event-brief__k">{labels.event}</p>
          <h2>受賞者たち · 10.10–10.12</h2>
          <p>タイムテーブルと会場MAPは、見たいパフォーマーが決まった後にすぐ確認できます。</p>
        </div>
        <div className="fe-event-brief__actions">
          <button type="button" onClick={onOpenTimetable}>
            時間を見る
          </button>
          <button type="button" onClick={onOpenMap}>
            MAP
          </button>
        </div>
      </section>

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
