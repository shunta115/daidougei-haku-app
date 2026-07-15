import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './festival.css'
import { AdminDashboardScreen } from './components/AdminDashboardScreen'
import { FestivalBackground } from './components/FestivalBackground'
import { PerformerBottomNav } from './components/performer/PerformerBottomNav'
import { PerformerHubScreen } from './components/performer/PerformerHubScreen'
import { MyRegistrationsListScreen } from './components/MyRegistrationsListScreen'
import { RegisterCompleteScreen } from './components/RegisterCompleteScreen'
import { RegisterFormScreen } from './components/RegisterFormScreen'
import { TopBar } from './components/TopBar'
import { HomeScreen } from './components/home/HomeScreen'
import { MapScreen } from './components/visitor/MapScreen'
import { OshiListScreen } from './components/visitor/OshiListScreen'
import { PerformerDetailScreen } from './components/visitor/PerformerDetailScreen'
import { PerformerListScreen } from './components/visitor/performer/PerformerListScreen'
import { TimetableScreen } from './components/visitor/TimetableScreen'
import { TipsScreen } from './components/visitor/TipsScreen'
import { VisitorBottomNav } from './components/visitor/VisitorBottomNav'
import { VisitorFab, VisitorQuickSheet } from './components/visitor/VisitorQuickSheet'
import { SPOTLIGHT_IDS, TODAYS_PICK_IDS, performerById } from './data'
import { getPerformerById, getPerformers, liveStreamPerformers, approvedStreamers } from './lib/performerCatalog'
import { seedStreamApplicationsIfEmpty } from './lib/streamApplicationsStorage'
import { LiveStreamScreen } from './components/stream/LiveStreamScreen'
import { StreamPerformerRegisterScreen } from './components/stream/StreamPerformerRegisterScreen'
import { StreamPerformerRegisterCompleteScreen } from './components/stream/StreamPerformerRegisterCompleteScreen'
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
import {
  BETA_SUPPORT_MESSAGE,
  canAccessPerformerAreas,
  canAccessStaffAreas,
  canProcessOnlineSupport,
  canWatchLiveStream,
  sanitizePersonaForProduction,
} from './lib/productionGuard'
import { readAppPersona, writeAppPersona } from './session/appPersona'
import { BetaPrepNotice } from './components/shared/BetaPrepNotice'
import type { AppPersona, Performer, PerformerFlow, VisitorTab } from './types'

export function FestivalApp() {
  const [personaState, setPersonaState] = useState<AppPersona>(() => sanitizePersonaForProduction(readAppPersona()))
  const [visitorTab, setVisitorTab] = useState<VisitorTab>(() => 'home')
  const [performerFlow, setPerformerFlow] = useState<PerformerFlow>(() => 'hub')
  const [favTick, setFavTick] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [mapFocusVenueId, setMapFocusVenueId] = useState<string | null>(null)
  const [, setGamificationTick] = useState(0)
  const [fabOpen, setFabOpen] = useState(false)
  const [lastSubmittedRegId, setLastSubmittedRegId] = useState<string | null>(null)
  const [registerEditId, setRegisterEditId] = useState<string | null>(null)
  const [performerEntryFromVisitor, setPerformerEntryFromVisitor] = useState(false)
  /** 登録フォームの「戻る」先（一覧から開いた場合は一覧へ） */
  const [registerBackToList, setRegisterBackToList] = useState(false)
  const [liveStreamId, setLiveStreamId] = useState<string | null>(null)
  const [streamOpenFocusTip, setStreamOpenFocusTip] = useState(false)
  const [betaNotice, setBetaNotice] = useState<string | null>(null)
  const performers = getPerformers()
  const persona = sanitizePersonaForProduction(personaState)

  useEffect(() => {
    if (canAccessStaffAreas()) seedStreamApplicationsIfEmpty()
  }, [])

  useEffect(() => {
    if (personaState !== persona) {
      writeAppPersona('visitor')
      setPersonaState('visitor')
    }
  }, [personaState, persona])

  const { live, next } = buildMarkedPulses(performers)
  const liveArtist = live ? getPerformerById(live.performerId) : undefined
  const nextArtist = next ? getPerformerById(next.performerId) : undefined
  const liveStreamers = liveStreamPerformers()
  const upcomingStreamers = approvedStreamers().filter((p) => !p.isLive)
  const hotVenue = hotVenueForDashboard()
  const goVenueId = live?.venueId ?? next?.venueId ?? hotVenue.id

  const bumpFav = useCallback(() => setFavTick((n) => n + 1), [])
  const bumpGame = useCallback(() => setGamificationTick((n) => n + 1), [])

  const openDetail = useCallback((id: string) => {
    if (!getPerformerById(id)) return
    setDetailId(id)
  }, [])

  const openLiveStream = useCallback((id: string, focusTip = false) => {
    const p = getPerformerById(id)
    if (!canWatchLiveStream(p)) return
    setDetailId(null)
    setStreamOpenFocusTip(focusTip)
    setLiveStreamId(id)
    window.history.replaceState(null, '', `#live-${id}`)
  }, [])

  const handleWatchStream = useCallback(
    (id: string) => {
      openLiveStream(id, false)
    },
    [openLiveStream],
  )

  const handleSupportStream = useCallback(
    (id: string) => {
      if (!canProcessOnlineSupport()) {
        setBetaNotice(BETA_SUPPORT_MESSAGE)
        return
      }
      openLiveStream(id, true)
    },
    [openLiveStream],
  )

  const showBetaSupport = useCallback(() => {
    setBetaNotice(BETA_SUPPORT_MESSAGE)
  }, [])

  const closeLiveStream = useCallback(() => {
    setLiveStreamId(null)
    setStreamOpenFocusTip(false)
    if (window.location.hash.startsWith('#live-')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
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
    const clearBadHash = () => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    const syncHash = () => {
      const hash = window.location.hash

      if (hash.match(/^#(admin|performer)/)) {
        if (!canAccessStaffAreas() && !canAccessPerformerAreas()) {
          clearBadHash()
          writeAppPersona('visitor')
          setPersonaState('visitor')
          setVisitorTab('home')
          setDetailId(null)
          setLiveStreamId(null)
        }
        return
      }

      const liveMatch = hash.match(/^#live-(.+)$/)
      const liveId = liveMatch?.[1]
      if (liveId) {
        const p = getPerformerById(liveId)
        if (!p || !canWatchLiveStream(p)) {
          clearBadHash()
          setLiveStreamId(null)
          setStreamOpenFocusTip(false)
          writeAppPersona('visitor')
          setPersonaState('visitor')
          setVisitorTab('home')
          setDetailId(null)
          return
        }
        writeAppPersona('visitor')
        setPersonaState('visitor')
        setVisitorTab('home')
        setDetailId(null)
        setStreamOpenFocusTip(false)
        setLiveStreamId(liveId)
        return
      }

      const m = hash.match(/^#artist-(.+)$/)
      const id = m?.[1]
      if (id) {
        if (!getPerformerById(id) && !performerById(id)) {
          clearBadHash()
          setDetailId(null)
          setVisitorTab('home')
          return
        }
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
    setLiveStreamId(null)
    setStreamOpenFocusTip(false)
    setRegisterEditId(null)
    setLastSubmittedRegId(null)
    setPerformerEntryFromVisitor(false)
    setRegisterBackToList(false)
  }, [])

  const goVisitorBrowseActs = useCallback(() => {
    writeAppPersona('visitor')
    setPersonaState('visitor')
    setVisitorTab('performers')
  }, [])

  const openStreamRegisterFromVisitor = useCallback(() => {
    if (!canAccessPerformerAreas()) return
    setPerformerEntryFromVisitor(true)
    writeAppPersona('performer')
    setPersonaState('performer')
    setPerformerFlow('streamRegister')
  }, [])

  const enterAdminPortal = useCallback(() => {
    if (!canAccessStaffAreas()) return
    writeAppPersona('admin')
    setPersonaState('admin')
  }, [])

  const onRegisterSuccess = useCallback((id: string) => {
    setLastSubmittedRegId(id)
    setRegisterEditId(null)
    setPerformerFlow('registerComplete')
  }, [])

  const spotlight = SPOTLIGHT_IDS.map((id) => getPerformerById(id) ?? performerById(id)).filter(Boolean) as Performer[]
  const todaysPicks = TODAYS_PICK_IDS.map((id) => getPerformerById(id) ?? performerById(id)).filter(Boolean) as Performer[]
  const primePicksForHome = [...spotlight, ...todaysPicks]
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, 4)

  const detailPerformer = detailId ? getPerformerById(detailId) : undefined
  const liveStreamPerformer =
    liveStreamId && canWatchLiveStream(getPerformerById(liveStreamId))
      ? getPerformerById(liveStreamId)
      : undefined

  const renderVisitorBody = (): ReactNode => {
    switch (visitorTab) {
      case 'home':
        return (
          <HomeScreen
            liveStreamers={liveStreamers}
            upcomingStreamers={upcomingStreamers}
            live={live}
            next={next}
            livePerformer={liveArtist}
            nextPerformer={nextArtist}
            pickPerformers={primePicksForHome}
            hotVenue={hotVenue}
            goVenueId={goVenueId}
            onWatchStream={handleWatchStream}
            onSupportStream={handleSupportStream}
            onOpenDetail={openDetail}
            onOpenMap={() => setVisitorTab('map')}
            onNearShows={() => {
              setMapFocusVenueId(goVenueId)
              setVisitorTab('map')
            }}
            onOpenTimetable={() => setVisitorTab('timetable')}
            onOpenOshi={() => setVisitorTab('oshi')}
            onShare={() => void shareFestival()}
            onStreamRegister={openStreamRegisterFromVisitor}
            onAdmin={enterAdminPortal}
            showStaffEntry={canAccessStaffAreas()}
            showStreamRegisterEntry={canAccessPerformerAreas()}
          />
        )
      case 'performers':
        return (
          <PerformerListScreen
            performers={performers}
            favTick={favTick}
            onOpenDetail={openDetail}
            onWatchStream={handleWatchStream}
            onSupportStream={handleSupportStream}
            onToggleFavorite={(id) => {
              const was = readFavorites().includes(id)
              toggleFavorite(id)
              if (!was) bumpXp(4)
              bumpFav()
            }}
          />
        )
      case 'timetable':
        return (
          <TimetableScreen favTick={favTick} onOpenDetail={openDetail} onFavChange={bumpFav} />
        )
      case 'map':
        return <MapScreen focusVenueId={mapFocusVenueId} onConsumedFocus={consumeMapFocus} />
      case 'tips':
        return (
          <TipsScreen
            performers={performers}
            onOpenPerformer={openDetail}
            onXpBump={bumpGame}
            onWatchStream={handleWatchStream}
            onSupportStream={handleSupportStream}
            onBetaSupport={showBetaSupport}
          />
        )
      case 'oshi':
        return (
          <OshiListScreen
            performers={performers}
            favTick={favTick}
            onFavoritesChange={bumpFav}
            onOpenPerformer={openDetail}
            onWatchStream={handleWatchStream}
            onSupportStream={handleSupportStream}
            onBetaSupport={showBetaSupport}
          />
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
            onOpenStreamRegister={() => {
              setPerformerEntryFromVisitor(false)
              setPerformerFlow('streamRegister')
            }}
            onOpenEntry={() => {
              setPerformerEntryFromVisitor(false)
              setRegisterBackToList(false)
              setRegisterEditId(null)
              setPerformerFlow('register')
            }}
            onOpenList={() => setPerformerFlow('myRegistrations')}
            onBrowseActs={goVisitorBrowseActs}
          />
        )
      case 'streamRegister':
        return (
          <StreamPerformerRegisterScreen
            onSuccess={() => setPerformerFlow('streamRegisterComplete')}
            onBack={() => {
              if (performerEntryFromVisitor) {
                writeAppPersona('visitor')
                setPersonaState('visitor')
                setVisitorTab('home')
                setPerformerEntryFromVisitor(false)
                setPerformerFlow('hub')
              } else {
                setPerformerFlow('hub')
              }
            }}
          />
        )
      case 'streamRegisterComplete':
        return (
          <StreamPerformerRegisterCompleteScreen
            fromVisitor={performerEntryFromVisitor}
            onBackHub={() => {
              if (performerEntryFromVisitor) {
                writeAppPersona('visitor')
                setPersonaState('visitor')
                setVisitorTab('home')
                setPerformerEntryFromVisitor(false)
              }
              setPerformerFlow('hub')
            }}
          />
        )
      case 'myRegistrations':
        return (
          <MyRegistrationsListScreen
            onBack={() => setPerformerFlow('hub')}
            onNewRegistration={() => {
              setRegisterEditId(null)
              setLastSubmittedRegId(null)
              setRegisterBackToList(true)
              setPerformerFlow('register')
            }}
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
                setRegisterBackToList(false)
              } else if (registerBackToList) {
                setRegisterBackToList(false)
                setPerformerFlow('myRegistrations')
              } else {
                setPerformerFlow('hub')
              }
            }}
          />
        )
      case 'registerComplete':
        return (
          <RegisterCompleteScreen
            onViewList={() => setPerformerFlow('myRegistrations')}
            onTop={() => {
              writeAppPersona('visitor')
              setPersonaState('visitor')
              setVisitorTab('home')
              setPerformerFlow('hub')
              setLastSubmittedRegId(null)
              setRegisterEditId(null)
              setPerformerEntryFromVisitor(false)
              setRegisterBackToList(false)
            }}
            onReEdit={() => {
              setRegisterBackToList(false)
              if (lastSubmittedRegId) setRegisterEditId(lastSubmittedRegId)
              setPerformerFlow('register')
            }}
          />
        )
      default:
        return null
    }
  }

  const rootClass = `fe-root fe-root--${persona}${persona === 'visitor' && visitorTab === 'home' ? ' fe-root--visitor-home' : ''}`

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
                  onWatchStream={handleWatchStream}
                  onSupportStream={handleSupportStream}
                  onBetaSupport={showBetaSupport}
                />
              </div>
            ) : null}
            {liveStreamPerformer ? (
              <LiveStreamScreen
                performer={liveStreamPerformer}
                focusTipOnMount={streamOpenFocusTip}
                onClose={closeLiveStream}
                onBetaSupport={showBetaSupport}
              />
            ) : null}
            {betaNotice ? <BetaPrepNotice message={betaNotice} onClose={() => setBetaNotice(null)} /> : null}
          </>
        ) : null}

        {persona === 'performer' && canAccessPerformerAreas() ? (
          <>
            <TopBar persona="performer" onExitPerformerOrAdmin={goVisitorHome} />
            {renderPerformerBody()}
            <PerformerBottomNav
              flow={performerFlow}
              onHub={() => setPerformerFlow('hub')}
              onEntry={() => {
                setPerformerEntryFromVisitor(false)
                setRegisterBackToList(false)
                setRegisterEditId(null)
                setPerformerFlow('register')
              }}
              onList={() => setPerformerFlow('myRegistrations')}
            />
          </>
        ) : null}

        {persona === 'admin' && canAccessStaffAreas() ? (
          <>
            <TopBar persona="admin" onExitPerformerOrAdmin={goVisitorHome} />
            <AdminDashboardScreen onExit={goVisitorHome} />
          </>
        ) : null}
      </div>
    </div>
  )
}
