import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { LiveWatchScreen } from '../../src/platform/screens/LiveWatchScreen'
import { PerformerLiveScreen } from '../../src/platform/screens/PerformerLiveScreen'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'

function Harness() {
  const [mini, setMini] = useState(false)
  const [closed, setClosed] = useState(false)
  const host = new URLSearchParams(location.search).get('screen') === 'host'
  return <div className="pl-app">
    <div style={{ position: 'fixed', zIndex: 2000, top: 0, left: '50%', transform: 'translateX(-50%)', background: '#5a164e', color: '#fff', fontSize: 9, padding: '2px 5px', pointerEvents: 'none' }}>LOCAL FIXTURE · NOT LIVE</div>
    {mini ? <main data-testid="fixture-home" style={{ padding: 40 }}>HAKU内の別画面（レイアウト試験）</main> : null}
    <div className="pl-shell pl-shell--live">
      {closed ? <p data-testid="fixture-closed">視聴終了</p> : host ? <PerformerLiveScreen onBack={() => setClosed(true)} onPreviewYouTube={() => undefined} /> : <div className={mini ? 'pl-live-session pl-live-session--mini' : 'pl-live-session'}>
        <LiveWatchScreen performerId="qa-performer" mini={mini} onBack={() => setClosed(true)} onTip={() => { document.body.dataset.tipOpened = 'true' }} onMinimize={() => setMini(true)} onRestore={() => setMini(false)} onClose={() => setClosed(true)} onEnded={() => setClosed(true)} />
      </div>}
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<LangProvider><Harness /></LangProvider>)
