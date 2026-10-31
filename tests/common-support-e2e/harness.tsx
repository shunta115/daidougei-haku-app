import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { ConnectedLiveWatchScreen } from '../../src/platform/screens/ConnectedLiveWatchScreen'
import { PerformerPublicScreen } from '../../src/platform/screens/PerformerPublicScreen'
import { TipScreen } from '../../src/platform/screens/TipScreen'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'
function App() {
  const performerId = new URLSearchParams(location.search).get('performer') || 'fixture'
  const [tip, setTip] = useState(false)
  return <LangProvider>{tip ? <TipScreen performerId={performerId} returnToLive onBack={() => setTip(false)} onDone={() => {}} /> : new URLSearchParams(location.search).has('profile') ? <PerformerPublicScreen performerId={performerId} onBack={() => {}} onWatchLive={() => {}} onTip={() => setTip(true)} /> : <ConnectedLiveWatchScreen performerId={performerId} onBack={() => {}} onTip={() => setTip(true)} />}</LangProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
