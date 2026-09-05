import { useEffect, useState } from 'react'
import { isPlatformPath, spaGo, FESTIVAL_PATH, PLATFORM_PATH } from './app/routes'
import { AppErrorBoundary } from './festival/components/shared/AppErrorBoundary'
import { FestivalApp } from './festival/FestivalApp'
import { LangProvider } from './i18n/LangProvider'
import { PlatformApp } from './platform/PlatformApp'
import { AuthProvider } from './platform/lib/auth'

function isKnownPath(pathname: string) {
  return pathname === FESTIVAL_PATH || isPlatformPath(pathname)
}

function NotFoundScreen() {
  return (
    <div className="pl-app" style={{ minHeight: '100dvh', padding: 24 }}>
      <p className="pl-brand">大道芸博</p>
      <h1>ページが見つかりません</h1>
      <p>このURLには画面がありません。</p>
      <button type="button" onClick={() => spaGo(FESTIVAL_PATH)}>
        開催情報へ
      </button>
      <button type="button" onClick={() => spaGo(PLATFORM_PATH)}>
        LIVE・ログインへ
      </button>
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return (
    <AppErrorBoundary>
      <LangProvider>
        <AuthProvider>
          {!isKnownPath(path) ? <NotFoundScreen /> : isPlatformPath(path) ? <PlatformApp /> : <FestivalApp />}
        </AuthProvider>
      </LangProvider>
    </AppErrorBoundary>
  )
}
