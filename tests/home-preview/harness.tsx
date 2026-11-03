import React from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { FanHomeScreen } from '../../src/platform/screens/FanHomeScreen'
import '../../src/platform/experience.css'
import '../../src/platform/platform.css'
import './preview.css'
function Preview(){
 const [notice,setNotice]=React.useState('')
 const profile=(id:string)=>setNotice(`プロフィール・フォロー導線を確認 (${id})。実際の操作は実行しません。`)
 return <><aside className="sample-banner">デザイン確認用サンプル · 実際のLIVE・予約ではありません</aside><FanHomeScreen onOpenPerformer={profile} onWatchLive={()=>setNotice('視聴導線を確認。配信サービスには接続しません。')} onTip={()=>setNotice('応援導線を確認。決済操作は実行しません。')} onOpenSearch={()=>setNotice('すべてのパフォーマー検索への導線を確認。')} onOpenLiveList={()=>setNotice('LIVE一覧への導線を確認。')} onOpenMap={()=>setNotice('出演予定・MAPへの導線を確認。')} onOpenNotifications={()=>setNotice('通知への導線を確認。')} />{notice ? <div role="status" className="sample-notice"><p>{notice}</p><button onClick={()=>setNotice('')}>閉じる</button></div>:null}<nav className="sample-nav" aria-label="サンプル下部ナビ"><strong>⌂ ホーム</strong><button onClick={()=>setNotice('検索への導線を確認。')}>検索</button><button onClick={()=>setNotice('LIVE一覧への導線を確認。')}>LIVE</button><button onClick={()=>setNotice('マイページへの導線を確認。')}>マイページ</button></nav></>
}
createRoot(document.getElementById('root')!).render(<LangProvider><Preview /></LangProvider>)
