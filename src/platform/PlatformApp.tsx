import { useEffect, useState, type ReactNode } from 'react'
import { FESTIVAL_PATH, spaGo } from '../app/routes'
import { PUBLIC_EVENT_META } from '../festival/data/public/eventMeta'
import { useAuth } from './lib/auth'
import { LanguageToggle, useLang } from '../i18n/LangProvider'
import { BottomNav } from './components/BottomNav'
import { PlatformBackground } from './components/PlatformBackground'
import { AuthScreen } from './screens/AuthScreen'
import { FanHomeScreen } from './screens/FanHomeScreen'
import { SearchScreen } from './screens/SearchScreen'
import { PerformerPublicScreen } from './screens/PerformerPublicScreen'
import { PerformerHomeScreen } from './screens/PerformerHomeScreen'
import { PerformerEditScreen } from './screens/PerformerEditScreen'
import { PerformerLiveScreen } from './screens/PerformerLiveScreen'
import { PerformerHistoryScreen } from './screens/PerformerHistoryScreen'
import { NotificationsScreen } from './screens/NotificationsScreen'
import { LiveWatchScreen } from './screens/LiveWatchScreen'
import { LiveListScreen } from './screens/LiveListScreen'
import { TipScreen } from './screens/TipScreen'
import { FanProfileScreen } from './screens/FanProfileScreen'
import { AdminDashboardScreen, AdminEventScreen, AdminUsersScreen } from './screens/AdminScreens'
import { AdminOpsScreen } from './screens/AdminOpsScreen'
import { OrganizerHomeScreen } from './screens/OrganizerHomeScreen'
import type { PlatformScreen } from './lib/types'
import { supabaseAuthHeaders } from './lib/supabase'
import { trackProductEvent } from './lib/track'
import './platform.css'

function SetupScreen() {
  const { t } = useLang()
  return (
    <div className="pl-shell pl-shell--flush">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p className="pl-brand">{t('appName')}</p>
        <LanguageToggle />
      </div>
      <h1 className="pl-h1">{t('setupNeeded')}</h1>
      <p className="pl-muted">{t('setupHint')}</p>
      <button type="button" className="pl-btn pl-btn--block" onClick={() => spaGo(FESTIVAL_PATH)}>
        {t('seeEvent')}
      </button>
    </div>
  )
}

function WelcomeScreen({ onAuth }: { onAuth: () => void }) {
  const { t } = useLang()
  const meta = PUBLIC_EVENT_META
  return (
    <div className="pl-shell pl-shell--flush">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p className="pl-brand">{t('appName')}</p>
        <LanguageToggle />
      </div>
      <h1 className="pl-h1">{t('welcomeTitle')}</h1>
      <p className="pl-muted">
        {meta.eventNameJa} {meta.dateLabel} · {meta.placeLabel}
        {t('welcomeLead')}
      </p>
      <div className="pl-card" style={{ marginTop: 20 }}>
        <p className="pl-muted" style={{ margin: 0 }}>
          {t('welcomePublic')}
        </p>
      </div>
      <button type="button" className="pl-btn pl-btn--block" onClick={onAuth}>
        {t('start')}
      </button>
      <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" style={{ marginTop: 12 }} onClick={() => spaGo(FESTIVAL_PATH)}>
        {t('seeEvent')}
      </button>
    </div>
  )
}

function homeForRole(role: string | undefined): PlatformScreen {
  if (role === 'admin') return 'admin'
  if (role === 'performer') return 'performer-home'
  if (role === 'organizer') return 'organizer-home'
  return 'fan-home'
}

function initialGuestScreen(): PlatformScreen {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('auth') === '1' || q.get('watch') || q.get('tipTo') || q.get('stripe') || q.get('live') === '1') return 'auth'
  } catch {
    /* ignore */
  }
  return 'welcome'
}

function PlatformShell() {
  const { ready, configured, user, profile } = useAuth()
  const { t } = useLang()
  const [screen, setScreen] = useState<PlatformScreen>(initialGuestScreen)
  const [performerId, setPerformerId] = useState<string | null>(null)
  const [tipFlash, setTipFlash] = useState<string | null>(null)
  const [tipReturn, setTipReturn] = useState<PlatformScreen>('fan-home')

  useEffect(() => {
    const url = new URL(window.location.href)
    const tip = url.searchParams.get('tip')
    const sessionId = url.searchParams.get('session_id')
    const ret = url.searchParams.get('return')
    const pid = url.searchParams.get('performerId')
    const watch = url.searchParams.get('watch')
    const auth = url.searchParams.get('auth')
    const tipTo = url.searchParams.get('tipTo')
    const stripe = url.searchParams.get('stripe')
    const liveList = url.searchParams.get('live')
    if (watch) {
      window.sessionStorage.setItem('pl-watch', watch)
      url.searchParams.delete('watch')
    }
    if (tipTo) {
      window.sessionStorage.setItem('pl-tip-to', tipTo)
      url.searchParams.delete('tipTo')
    }
    if (liveList === '1') {
      window.sessionStorage.setItem('pl-open-live-list', '1')
    }
    if (stripe === 'return' || stripe === 'refresh') {
      window.sessionStorage.setItem('pl-stripe-connect', stripe)
    }
    if (auth === '1' || watch || tipTo || stripe || liveList === '1') {
      setScreen('auth')
      url.searchParams.delete('auth')
    }
    if (tip === 'success') {
      setTipFlash('tipSuccess')
      trackProductEvent('tip_success', { performerId: pid })
      if (sessionId) window.sessionStorage.setItem('pl-tip-confirm', sessionId)
      if (ret === 'live' && pid) {
        window.sessionStorage.setItem('pl-tip-return', JSON.stringify({ screen: 'live-watch', performerId: pid }))
      }
    } else if (tip === 'cancel') {
      setTipFlash('tipCancelled')
      if (ret === 'live' && pid) {
        window.sessionStorage.setItem('pl-tip-return', JSON.stringify({ screen: 'live-watch', performerId: pid }))
      }
    }
    if (tip || watch || auth || tipTo || stripe || liveList) {
      url.searchParams.delete('tip')
      url.searchParams.delete('session_id')
      url.searchParams.delete('performerId')
      url.searchParams.delete('return')
      url.searchParams.delete('stripe')
      url.searchParams.delete('live')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const sessionId = window.sessionStorage.getItem('pl-tip-confirm')
    if (!sessionId) return
    window.sessionStorage.removeItem('pl-tip-confirm')
    void (async () => {
      const headers = await supabaseAuthHeaders()
      await fetch('/api/stripe/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined)
    })()
  }, [user])

  useEffect(() => {
    if (!ready) return
    if (!configured) {
      setScreen('setup')
      return
    }
    if (!user) {
      setScreen((s) => (s === 'auth' || s === 'welcome' ? s : 'welcome'))
      return
    }
    if (profile?.status === 'suspended' || profile?.status === 'deleted') {
      return
    }
    const watchId = window.sessionStorage.getItem('pl-watch')
    if (watchId) {
      window.sessionStorage.removeItem('pl-watch')
      setPerformerId(watchId)
      setScreen('live-watch')
      return
    }
    const openLiveList = window.sessionStorage.getItem('pl-open-live-list')
    if (openLiveList) {
      window.sessionStorage.removeItem('pl-open-live-list')
      setScreen('live-list')
      return
    }
    const tipToId = window.sessionStorage.getItem('pl-tip-to')
    if (tipToId) {
      window.sessionStorage.removeItem('pl-tip-to')
      setPerformerId(tipToId)
      setTipReturn(homeForRole(profile?.role))
      setScreen('tip')
      return
    }
    const stripeConnect = window.sessionStorage.getItem('pl-stripe-connect')
    if (stripeConnect) {
      window.sessionStorage.removeItem('pl-stripe-connect')
      if (profile?.role === 'performer') {
        setScreen('performer-edit')
        return
      }
    }
    const raw = window.sessionStorage.getItem('pl-tip-return')
    if (raw) {
      window.sessionStorage.removeItem('pl-tip-return')
      try {
        const parsed = JSON.parse(raw) as { screen?: string; performerId?: string }
        if (parsed.performerId && parsed.screen === 'live-watch') {
          setPerformerId(parsed.performerId)
          setTipReturn('live-watch')
          setScreen('live-watch')
          return
        }
      } catch {
        /* ignore */
      }
    }
    setScreen((s) => {
      if (s === 'welcome' || s === 'auth' || s === 'setup') return homeForRole(profile?.role)
      return s
    })
  }, [ready, configured, user, profile])

  if (!ready) {
    return (
      <div className="pl-app">
        <div className="pl-shell">
          <p className="pl-muted">Loading…</p>
        </div>
      </div>
    )
  }

  if (screen === 'setup' || !configured) {
    return (
      <div className="pl-app">
        <SetupScreen />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="pl-app">
        {screen === 'auth' ? (
          <AuthScreen onDone={() => setScreen(homeForRole(undefined))} />
        ) : (
          <WelcomeScreen onAuth={() => setScreen('auth')} />
        )}
      </div>
    )
  }

  if (profile?.status === 'suspended' || profile?.status === 'deleted') {
    return (
      <div className="pl-app">
        <div className="pl-shell">
          <h1 className="pl-h1">Account unavailable</h1>
          <p className="pl-muted">This account is suspended or deleted. Contact support.</p>
        </div>
      </div>
    )
  }

  const role = profile?.role ?? 'fan'
  const navRole = role === 'admin' ? 'admin' : role === 'performer' ? 'performer' : role === 'organizer' ? 'organizer' : 'fan'
  const showNav = !['tip', 'performer-history', 'live-watch', 'performer-live'].includes(screen) && !(performerId && screen === 'profile')
  const liveShell = screen === 'live-watch' || screen === 'performer-live'

  const openPerformer = (id: string) => {
    setPerformerId(id)
    setScreen('profile')
  }

  const openWatch = (id: string) => {
    setPerformerId(id)
    setScreen('live-watch')
  }

  let body: ReactNode = null

  if (screen === 'live-watch' && performerId) {
    body = (
      <LiveWatchScreen
        performerId={performerId}
        onBack={() => {
          setPerformerId(null)
          setScreen(homeForRole(role))
        }}
        onTip={() => {
          trackProductEvent('click_tip', { performerId })
          setTipReturn('live-watch')
          setScreen('tip')
        }}
      />
    )
  } else if (performerId && screen === 'tip') {
    body = (
      <TipScreen
        performerId={performerId}
        returnToLive={tipReturn === 'live-watch'}
        onBack={() => setScreen(tipReturn)}
        onDone={() => {
          setPerformerId(null)
          setScreen(homeForRole(role))
        }}
      />
    )
  } else if (performerId && screen === 'profile') {
    body = (
      <PerformerPublicScreen
        performerId={performerId}
        onBack={() => {
          setPerformerId(null)
          setScreen(homeForRole(role))
        }}
        onTip={() => {
          trackProductEvent('click_tip', { performerId })
          setTipReturn('profile')
          setScreen('tip')
        }}
        onWatchLive={() => setScreen('live-watch')}
      />
    )
  } else {
    switch (screen) {
      case 'fan-home':
        body = (
          <FanHomeScreen
            onOpenPerformer={openPerformer}
            onWatchLive={openWatch}
            onOpenSearch={() => setScreen('search')}
            onOpenLiveList={() => setScreen('live-list')}
            onTip={(id) => {
              trackProductEvent('click_tip', { performerId: id })
              setPerformerId(id)
              setTipReturn('fan-home')
              setScreen('tip')
            }}
          />
        )
        break
      case 'live-list':
        body = (
          <LiveListScreen
            onWatchLive={openWatch}
            onOpenPerformer={openPerformer}
          />
        )
        break
      case 'search':
        body = <SearchScreen onOpenPerformer={openPerformer} onWatchLive={openWatch} />
        break
      case 'notifications':
        body = (
          <NotificationsScreen
            onOpenLive={openWatch}
            onOpenPerformer={openPerformer}
          />
        )
        break
      case 'profile':
        body = <FanProfileScreen />
        break
      case 'performer-home':
        body = (
          <PerformerHomeScreen
            onEdit={() => setScreen('performer-edit')}
            onLive={() => setScreen('performer-live')}
            onHistory={() => setScreen('performer-history')}
          />
        )
        break
      case 'performer-edit':
        body = <PerformerEditScreen onBack={() => setScreen('performer-home')} />
        break
      case 'performer-live':
        body = <PerformerLiveScreen onBack={() => setScreen('performer-home')} />
        break
      case 'performer-history':
        body = <PerformerHistoryScreen onBack={() => setScreen('performer-home')} />
        break
      case 'admin':
        body = <AdminDashboardScreen />
        break
      case 'admin-event':
        body = <AdminEventScreen />
        break
      case 'admin-users':
        body = <AdminUsersScreen />
        break
      case 'admin-ops':
        body = <AdminOpsScreen />
        break
      case 'organizer-home':
        body = <OrganizerHomeScreen onOpenPerformer={openPerformer} />
        break
      default:
        body = (
          <FanHomeScreen
            onOpenPerformer={openPerformer}
            onWatchLive={openWatch}
            onOpenSearch={() => setScreen('search')}
            onOpenLiveList={() => setScreen('live-list')}
            onTip={(id) => {
              trackProductEvent('click_tip', { performerId: id })
              setPerformerId(id)
              setTipReturn('fan-home')
              setScreen('tip')
            }}
          />
        )
    }
  }

  return (
    <div className="pl-app">
      <div className={`pl-shell${liveShell ? ' pl-shell--live' : ''}`}>
        {showNav ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <LanguageToggle />
          </div>
        ) : null}
        {tipFlash ? (
          <div className="pl-card" style={{ marginBottom: 12 }}>
            <div className="pl-muted">{tipFlash === 'tipSuccess' || tipFlash === 'tipCancelled' ? t(tipFlash) : tipFlash}</div>
          </div>
        ) : null}
        {body}
      </div>
      {showNav ? (
        <BottomNav
          role={navRole}
          active={screen}
          onNavigate={(key) => {
            setPerformerId(null)
            setScreen(key as PlatformScreen)
          }}
        />
      ) : null}
    </div>
  )
}

export function PlatformApp() {
  return (
    <>
      <PlatformBackground />
      <PlatformShell />
    </>
  )
}
