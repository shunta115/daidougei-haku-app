import React from 'react'
import { createRoot } from 'react-dom/client'
import { LiveWatchScreen } from '../../src/platform/screens/LiveWatchScreen'
import { PerformerLiveScreen } from '../../src/platform/screens/PerformerLiveScreen'
import { performer } from './fixture-api'
import '../../src/platform/platform.css'
function Harness() {return <><div style={{background:'#8d250a',color:'white',padding:8,position:'relative',zIndex:200,pointerEvents:'none'}}>隔離QA・模擬通信。実配信・決済・本番DBへの接続なし</div>{new URLSearchParams(location.search).has('host')?<PerformerLiveScreen onBack={()=>{}} onPreviewYouTube={()=>{}}/>:<LiveWatchScreen performerId={performer.id} onBack={()=>{location.href='?list=1'}} onTip={()=>alert('QA: 応援処理は呼びません')} onRequireAuth={()=>alert('QAログイン')}/>}</>}
createRoot(document.getElementById('root')!).render(<Harness/> )
