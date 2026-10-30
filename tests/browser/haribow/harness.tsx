import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../../src/i18n/LangProvider'
import { LiveWatchScreen } from '../../../src/platform/screens/LiveWatchScreen'
import { PerformerLiveScreen } from '../../../src/platform/screens/PerformerLiveScreen'
import '../../../src/index.css'
import '../../../src/platform/platform.css'
const host = new URLSearchParams(location.search).get('host') === '1'
createRoot(document.getElementById('root')!).render(<LangProvider>{host ? <PerformerLiveScreen onBack={() => undefined} onPreviewYouTube={() => undefined} /> : <LiveWatchScreen performerId="qa-performer" onBack={() => undefined} onTip={() => { document.body.dataset.tip = 'opened' }} />}</LangProvider>)
