import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { MapScheduleScreen } from '../../src/platform/screens/MapScheduleScreen'
import { PerformerPublicScreen } from '../../src/platform/screens/PerformerPublicScreen'
import { performer } from './fixture-api'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'
function App() {
  const [profile, setProfile] = useState(new URLSearchParams(location.search).has('profile'))
  return <LangProvider><aside role="status">QR・共有デモ（実DB未接続）</aside>{profile
    ? <PerformerPublicScreen performerId={performer.id} onBack={() => setProfile(false)} onTip={() => {}} onWatchLive={() => {}} />
    : <MapScheduleScreen initialView="schedule" onOpenPerformer={() => setProfile(true)} onWatchLive={() => {}} />}</LangProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
