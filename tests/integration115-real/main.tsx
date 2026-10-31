import {createRoot} from 'react-dom/client'
import {AuthProvider,useAuth} from '../../src/platform/lib/auth'
import {LiveWatchScreen} from '../../src/platform/screens/LiveWatchScreen'
import {PerformerLiveScreen} from '../../src/platform/screens/PerformerLiveScreen'
import '../../src/platform/platform.css'
function Screens(){const auth=useAuth();const q=new URLSearchParams(location.search);if(!auth.ready||!auth.user||!auth.profile)return <p>TEST login required</p>;return q.has('host')?<PerformerLiveScreen onBack={()=>{}} onPreviewYouTube={()=>{}}/>:<LiveWatchScreen performerId={q.get('performer')!} onBack={()=>{}} onTip={()=>{}}/>}
createRoot(document.getElementById('root')!).render(<AuthProvider><Screens/></AuthProvider>)
