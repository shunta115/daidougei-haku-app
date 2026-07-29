import { useEffect, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
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
import { TipScreen } from './screens/TipScreen'
import { FanProfileScreen } from './screens/FanProfileScreen'
import { AdminDashboardScreen, AdminUsersScreen } from './screens/AdminScreens'
import type { PlatformScreen } from './lib/types'
import './platform.css'

function SetupScreen() {
  return (
    <div className="pl-shell pl-shell--flush">
      <p className="pl-brand">大道芸博</p>
      <h1 className="pl-h1">Setup required</h1>
      <p className="pl-muted">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, run the SQL migration, then redeploy.
      </p>
    </div>
  )
}

function WelcomeScreen({ onAuth }: { onAuth: () => void }) {
  return (
    <div className="pl-shell pl-shell--flush">
      <p className="pl-brand">大道芸博</p>
      <h1 className="pl-h1">Street performers. Fans. Tips.</h1>
      <p className="pl-muted">Go live. Get tipped. Grow your work — worldwide.</p>
      <div className="pl-card" style={{ marginTop: 20 }}>
        <p className="pl-muted" style={{ margin: 0 }}>
          Live · Follow · Tip · Connect. Built for performers who work the street every day.
        </p>
      </div>
      <button type="button" className="pl-btn pl-btn--block" onClick={onAuth}>
        Get started
      </button>
    </div>
  )
}

function homeForRole(role: string | undefined): PlatformScreen {
  if (role === 'admin') return 'admin'
  if (role === 'performer') return 'performer-home'
  return 'fan-home'
}

function PlatformShell() {
  const { ready, configured, user, profile } = useAuth()
  const [screen, setScreen] = useState<PlatformScreen>('welcome')
  const [performerId, setPerformerId] = useState<string | null>(null)
  const [tipFlash, setTipFlash] = useState<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const tip = url.searchParams.get('tip')
    const sessionId = url.searchParams.get('session_id')
    if (tip === 'success') {
      setTipFlash('Tip sent successfully.')
      if (sessionId) {
        void fetch('/api/stripe/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).catch(() => undefined)
      }
    } else if (tip === 'cancel') {
      setTipFlash('Tip was cancelled.')
    }
    if (tip) {
      url.searchParams.delete('tip')
      url.searchParams.delete('session_id')
      url.searchParams.delete('performerId')
      url.searchParams.delete('stripe')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

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
  const navRole = role === 'admin' ? 'admin' : role === 'performer' ? 'performer' : 'fan'
  const showNav = !['tip', 'performer-history'].includes(screen) && !performerId

  const openPerformer = (id: string) => {
    setPerformerId(id)
    setScreen('profile')
  }

  let body: ReactNode = null

  if (performerId && screen !== 'tip') {
    body = (
      <PerformerPublicScreen
        performerId={performerId}
        onBack={() => {
          setPerformerId(null)
          setScreen(homeForRole(role))
        }}
        onTip={() => setScreen('tip')}
      />
    )
  } else if (screen === 'tip' && performerId) {
    body = (
      <TipScreen
        performerId={performerId}
        onBack={() => setScreen('profile')}
        onDone={() => {
          setPerformerId(null)
          setScreen(homeForRole(role))
        }}
      />
    )
  } else {
    switch (screen) {
      case 'fan-home':
        body = <FanHomeScreen onOpenPerformer={openPerformer} />
        break
      case 'search':
        body = <SearchScreen onOpenPerformer={openPerformer} />
        break
      case 'notifications':
        body = <NotificationsScreen />
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
      case 'admin-users':
        body = <AdminUsersScreen />
        break
      default:
        body = <FanHomeScreen onOpenPerformer={openPerformer} />
    }
  }

  return (
    <div className="pl-app">
      <div className="pl-shell">
        {tipFlash ? (
          <div className="pl-card" style={{ marginBottom: 12 }}>
            <div className="pl-muted">{tipFlash}</div>
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
    <AuthProvider>
      <PlatformBackground />
      <PlatformShell />
    </AuthProvider>
  )
}
