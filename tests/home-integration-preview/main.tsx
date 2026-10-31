import React from 'react'
import { createRoot } from 'react-dom/client'
import { FanHomeScreen } from '../../src/platform/screens/FanHomeScreen'
import { LangProvider } from '../../src/i18n/LangProvider'
import { snapshot, updateFixture } from './fixture'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'
window.fetch = async (input) => {
  if (input === '/api/home-ranking') return new Response(JSON.stringify(snapshot()), { status: 200, headers: {'Content-Type':'application/json'} })
  throw new Error('QA: external network disabled')
}
function App() {
  const [last, setLast] = React.useState('')
  const act = (action: string) => (id?: string) => setLast(`${action}:${typeof id === 'string' ? id : ''}`)
  return <LangProvider><aside style={{padding:6,background:'#fff4bd',color:'#222',fontSize:12}}>統合QAサンプル・本番接続なし（架空の出演者・予約）</aside><div className="pl-app"><div className="pl-shell"><FanHomeScreen onOpenPerformer={act('profile')} onWatchLive={act('watch')} onOpenSearch={act('search')} onOpenLiveList={act('live')} onOpenMap={act('map')} onOpenNotifications={act('notifications')} onTip={act('tip')} /></div></div><aside><button onClick={updateFixture}>活動順位を更新する</button><output aria-label="操作結果">{last}</output></aside></LangProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
