import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './festival.css'
import { AdminRegistrationsScreen } from './components/AdminRegistrationsScreen'
import { ExperienceSection } from './components/ExperienceSection'
import { FestivalBackground } from './components/FestivalBackground'
import { EventStripHeader } from './components/home/EventStripHeader'
import { FirstVisitGuideSection } from './components/home/FirstVisitGuideSection'
import { ForYouSection } from './components/home/ForYouSection'
import { FutureRoadmapSection } from './components/home/FutureRoadmapSection'
import { HomeAudiencePortals } from './components/home/HomeAudiencePortals'
import { HomeTipsTeaser } from './components/home/HomeTipsTeaser'
import { HomeOfficialEntry } from './components/home/HomeOfficialEntry'
import { NowCommandDashboard } from './components/home/NowCommandDashboard'
import { TodaysPicksSection } from './components/home/TodaysPicksSection'
import { LiveNextSection } from './components/LiveNextSection'
import { PerformerBottomNav } from './components/performer/PerformerBottomNav'
import { PerformerHubScreen } from './components/performer/PerformerHubScreen'
import { PerformerSocialCard } from './components/PerformerSocialCard'
import { RegisterCompleteScreen } from './components/RegisterCompleteScreen'
import { RegisterFormScreen } from './components/RegisterFormScreen'
import { Reveal } from './components/Reveal'
import { SpotlightSection } from './components/SpotlightSection'
import { TopBar } from './components/TopBar'
import { TrendingSection } from './components/TrendingSection'
import { LibraryScreen } from './components/visitor/LibraryScreen'
import { MapScreen } from './components/visitor/MapScreen'
import { PerformerDetailScreen } from './components/visitor/PerformerDetailScreen'
import { TimetableScreen } from './components/visitor/TimetableScreen'
import { TipsScreen } from './components/visitor/TipsScreen'
import { VisitorBottomNav } from './components/visitor/VisitorBottomNav'
import { VisitorFab, VisitorQuickSheet } from './components/visitor/VisitorQuickSheet'
import { HOT_RANK_IDS, PERFORMERS, SPOTLIGHT_IDS, TODAYS_PICK_IDS, performerById } from './data'
import { getDemoNow } from './lib/demoClock'
import { readFavorites, toggleFavorite } from './lib/favoritesStorage'
import { bumpXp } from './lib/gamificationStorage'
import {
  buildMarkedPulses,
  currentLiveSlot,
  hotVenueForDashboard,
  nextSlotForPerformerFromNow,
  slotsByPerformer,
} from './lib/scheduleEngine'
import { shareFestival } from './lib/share'
import { readAppPersona, writeAppPersona } from './session/appPersona'
import type { AppPersona, Performer, PerformerFlow, VisitorTab } from './types'

export function FestivalApp() {
  const [persona, setPersonaState] = useState<AppPersona>(() => readAppPersona())
  const [visitorTab, setVisitorTab] = useState<VisitorTab>(() => 'home')
  const [performerFlow, setPerformerFlow] = useState<PerformerFlow>(() => 'hub')
  const [favTick, setFavTick] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [mapFocusVenueId, setMapFocusVenueId] = useState<string | null>(null)
  const [gamificationTick, setGamificationTick] = useState(0)
  const [fabOpen, setFabOpen] = useState(false)
  const [lastSubmittedRegId, setLastSubmittedRegId] = useState<string | null>(null)
  const [registerEditId, setRegisterEditId] = useState<string | null>(null)
  const [performerEntryFromVisitor, setPerformerEntryFromVisitor] = useState(false)

  const { live, next } = buildMarkedPulses(PERFORMERS)
  const liveArtist = live ? performerById(live.performerId) : undefined
  const nextArtist = next ? performerById(next.performerId) : undefined
  const hotVenue = hotVenueForDashboard()
  const goVenueId = live?.venueId ?? next?.venueId ?? hotVenue.id

  const bumpFav = useCallback(() => setFavTick((n) => n + 1), [])
  const bumpGame = useCallback(() => setGamificationTick((n) => n + 1), [])

  const openDetail = useCallback((id: string) => {
    if (!performerById(id)) return
    setDetailId(id)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailId(null)
    if (window.location.hash.startsWith('#artist-')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const focusMapForPerformer = useCallback((p: Performer) => {
    const now = getDemoNow()
    const liveS = currentLiveSlot()
    if (liveS?.performerId === p.id) {
      setMapFocusVenueId(liveS.venueId)
      setVisitorTab('map')
      return
    }
    const upcoming = nextSlotForPerformerFromNow(p.id, now)
    if (upcoming) {
      setMapFocusVenueId(upcoming.venueId)
    } else {
      const first = slotsByPerformer(p.id)[0]
      setMapFocusVenueId(first?.venueId ?? hotVenue.id)
    }
    setVisitorTab('map')
  }, [hotVenue.id])

  const consumeMapFocus = useCallback(() => setMapFocusVenueId(null), [])

  useEffect(() => {
    const syncHash = () => {
      const m = window.location.hash.match(/^#artist-(.+)$/)
      const id = m?.[1]
      if (id && performerById(id)) {
        writeAppPersona('visitor')
        setPersonaState('visitor')
        setVisitorTab('performers')
        setDetailId(id)
      }
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  const goVisitorHome = useCallback(() => {
    writeAppPersona('visitor')
    setPersonaState('visitor')
    setVisitorTab('home')
    setPerformerFlow('hub')
    setDetailId(null)
    setRegisterEditId(null)
    setLastSubmittedRegId(null)
    setPerformerEntryFromVisitor(false)
  }, [])

  const goVisitorBrowseActs = useCallback(() => {
    writeAppPersona('visitor')
    setPersonaState('visitor')
    setVisitorTab('performers')
  }, [])

  const openPerformerRegisterFromVisitor = useCallback(() => {
    setPerformerEntryFromVisitor(true)
    setRegisterEditId(null)
    setLastSubmittedRegId(null)
    writeAppPersona('performer')
    setPersonaState('performer')
    setPerformerFlow('register')
  }, [])

  const enterAdminPortal = useCallback(() => {
    writeAppPersona('admin')
    setPersonaState('admin')
  }, [])

  const onRegisterSuccess = useCallback((id: string) => {
    setLastSubmittedRegId(id)
    setRegisterEditId(null)
    setPerformerFlow('registerComplete')
  }, [])

  const scrollTips = useCallback(() => {
    document.getElementById('fe-xp-anchor')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const spotlight = SPOTLIGHT_IDS.map((id) => performerById(id)).filter(Boolean) as typeof PERFORMERS
  const trending = HOT_RANK_IDS.map((id) => performerById(id)).filter(Boolean) as typeof PERFORMERS
  const todaysPicks = TODAYS_PICK_IDS.map((id) => performerById(id)).filter(Boolean) as typeof PERFORMERS

  const favoriteIds = readFavorites()

  const idsForYou = readFavorites()
  const forYouFavs = PERFORMERS.filter((p) => idsForYou.includes(p.id))
  const forYouRec = PERFORMERS.filter((p) => !idsForYou.includes(p.id))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 3)

  const detailPerformer = detailId ? performerById(detailId) : undefined

  const toggleNextFavorite = useCallback(() => {
    if (!nextArtist) return
    const was = readFavorites().includes(nextArtist.id)
    toggleFavorite(nextArtist.id)
    if (!was) bumpXp(5)
    bumpFav()
  }, [nextArtist, bumpFav])

  const renderVisitorBody = (): ReactNode => {
    switch (visitorTab) {
      case 'home':
        return (
          <main className="fe-main fe-main--home fe-main--dashhome">
            <EventStripHeader onShare={() => void shareFestival()} />
            <HomeOfficialEntry onPerformerRegister={openPerformerRegisterFromVisitor} onAdmin={enterAdminPortal} />
            <NowCommandDashboard
              live={live}
              next={next}
              livePerformer={liveArtist}
              nextPerformer={nextArtist}
              hotVenue={hotVenue}
              goVenueId={goVenueId}
              xpTick={gamificationTick}
              onStamp={bumpGame}
              onGoNow={() => {
                setMapFocusVenueId(goVenueId)
                setVisitorTab('map')
              }}
              onOpenMap={() => setVisitorTab('map')}
              onOpenTips={() => setVisitorTab('tips')}
              onOpenTimetable={() => setVisitorTab('timetable')}
              onToggleNextFavorite={toggleNextFavorite}
              nextIsFavorite={nextArtist ? favoriteIds.includes(nextArtist.id) : false}
              onOpenNextDetail={() => {
                if (nextArtist) openDetail(nextArtist.id)
              }}
            />
            <HomeAudiencePortals onScrollTips={scrollTips} />
            <Reveal>
              <HomeTipsTeaser onOpenLibrary={() => setVisitorTab('library')} />
            </Reveal>
            <Reveal>
              <LiveNextSection live={live} next={next} livePerformer={liveArtist} nextPerformer={nextArtist} />
            </Reveal>
            <Reveal>
              <TodaysPicksSection performers={todaysPicks} onOpen={openDetail} />
            </Reveal>
            <Reveal>
              <SpotlightSection performers={spotlight} onOpenPerformer={openDetail} />
            </Reveal>
            <Reveal>
              <ForYouSection favorites={forYouFavs} recommended={forYouRec} onOpen={openDetail} />
            </Reveal>
            <Reveal>
              <TrendingSection performers={trending} onOpenPerformer={openDetail} />
            </Reveal>
            <Reveal>
              <FirstVisitGuideSection />
            </Reveal>
            <Reveal>
              <ExperienceSection />
            </Reveal>
            <Reveal>
              <FutureRoadmapSection />
            </Reveal>
          </main>
        )
      case 'performers':
        return (
          <main className="fe-main fe-main--list">
            <header className="fe-list-hero">
              <p className="fe-list-hero__eyebrow">Official roster</p>
              <h1 className="fe-list-hero__title">Artists</h1>
              <p className="fe-list-hero__sub">下段からワンタップ · カード本文で詳細</p>
            </header>
            <div className="fe-list-stack">
              {PERFORMERS.map((p, i) => (
                <Reveal key={p.id}>
                  <PerformerSocialCard
                    performer={p}
                    index={i}
                    favoritesEnabled
                    favorite={favoriteIds.includes(p.id)}
                    onOpenDetail={(x) => openDetail(x.id)}
                    onQuickGo={focusMapForPerformer}
                    onQuickMap={focusMapForPerformer}
                    onQuickTips={() => {
                      setVisitorTab('tips')
                      bumpGame()
                    }}
                    onToggleFavorite={() => {
                      const was = readFavorites().includes(p.id)
                      toggleFavorite(p.id)
                      if (!was) bumpXp(4)
                      bumpFav()
                    }}
                  />
                </Reveal>
              ))}
            </div>
          </main>
        )
      case 'timetable':
        return <TimetableScreen favTick={favTick} />
      case 'map':
        return <MapScreen focusVenueId={mapFocusVenueId} onConsumedFocus={consumeMapFocus} />
      case 'tips':
        return <TipsScreen performers={PERFORMERS} onOpenPerformer={openDetail} onXpBump={bumpGame} />
      case 'library':
        return (
          <LibraryScreen performers={PERFORMERS} favTick={favTick} onFavoritesChange={bumpFav} onOpenPerformer={openDetail} />
        )
      default:
        return null
    }
  }

  const renderPerformerBody = (): ReactNode => {
    switch (performerFlow) {
      case 'hub':
        return (
          <PerformerHubScreen
            onOpenEntry={() => {
              setPerformerEntryFromVisitor(false)
              setRegisterEditId(null)
              setPerformerFlow('register')
            }}
            onBrowseActs={goVisitorBrowseActs}
          />
        )
      case 'register':
        return (
          <RegisterFormScreen
            key={registerEditId ?? 'new'}
            editRegistrationId={registerEditId}
            onSuccess={onRegisterSuccess}
            onBack={() => {
              setRegisterEditId(null)
              if (performerEntryFromVisitor) {
                writeAppPersona('visitor')
                setPersonaState('visitor')
                setVisitorTab('home')
              } else {
                setPerformerFlow('hub')
              }
            }}
          />
        )
      case 'registerComplete':
        return (
          <RegisterCompleteScreen
            onTop={() => {
              writeAppPersona('visitor')
              setPersonaState('visitor')
              setVisitorTab('home')
              setPerformerFlow('hub')
              setLastSubmittedRegId(null)
              setRegisterEditId(null)
              setPerformerEntryFromVisitor(false)
            }}
            onReEdit={() => {
              if (lastSubmittedRegId) setRegisterEditId(lastSubmittedRegId)
              setPerformerFlow('register')
            }}
          />
        )
      default:
        return null
    }
  }

  const rootClass = `fe-root fe-root--${persona}`

  return (
    <div className={rootClass} lang="ja">
      <FestivalBackground />

      <div className="fe-shell">
        {persona === 'visitor' ? (
          <>
            <TopBar persona="visitor" onExitPerformerOrAdmin={goVisitorHome} visitorContext="Guest" />
            {renderVisitorBody()}
            <VisitorBottomNav tab={visitorTab} onChange={setVisitorTab} />
            <VisitorFab onOpen={() => setFabOpen(true)} />
            <VisitorQuickSheet open={fabOpen} onClose={() => setFabOpen(false)} onTab={setVisitorTab} />
            {detailPerformer ? (
              <div className="fe-overlay">
                <PerformerDetailScreen
                  performer={detailPerformer}
                  favorite={readFavorites().includes(detailPerformer.id)}
                  onClose={closeDetail}
                  onToggleFavorite={() => {
                    const was = readFavorites().includes(detailPerformer.id)
                    toggleFavorite(detailPerformer.id)
                    if (!was) bumpXp(5)
                    bumpFav()
                  }}
                  onOpenTimetable={() => {
                    closeDetail()
                    setVisitorTab('timetable')
                  }}
                  onOpenTips={() => {
                    closeDetail()
                    setVisitorTab('tips')
                  }}
                  onOpenMap={() => {
                    closeDetail()
                    focusMapForPerformer(detailPerformer)
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {persona === 'performer' ? (
          <>
            <TopBar persona="performer" onExitPerformerOrAdmin={goVisitorHome} />
            {renderPerformerBody()}
            <PerformerBottomNav
              flow={performerFlow}
              onHub={() => setPerformerFlow('hub')}
              onEntry={() => {
                setPerformerEntryFromVisitor(false)
                setRegisterEditId(null)
                setPerformerFlow('register')
              }}
            />
          </>
        ) : null}

        {persona === 'admin' ? (
          <>
            <TopBar persona="admin" onExitPerformerOrAdmin={goVisitorHome} />
            <AdminRegistrationsScreen onExit={goVisitorHome} />
          </>
        ) : null}
      </div>
    </div>
  )
}
