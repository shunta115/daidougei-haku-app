import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { ConnectedLiveWatchScreen } from '../../src/platform/screens/ConnectedLiveWatchScreen'
import { TipScreen } from '../../src/platform/screens/TipScreen'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'
function App() {
  const [tip, setTip] = useState(false)
  return <LangProvider>{tip ? <TipScreen performerId="fixture" returnToLive onBack={() => setTip(false)} onDone={() => {}} /> : <ConnectedLiveWatchScreen performerId="fixture" onBack={() => {}} onTip={() => setTip(true)} />}</LangProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
