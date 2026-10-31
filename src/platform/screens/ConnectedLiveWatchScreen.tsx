import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, Gift, ShieldCheck } from 'lucide-react'
import { getPerformer } from '../lib/api'
import type { Performer } from '../lib/types'
import { YouTubeLivePlayer } from '../components/YouTubeLivePlayer'
import { LiveWatchScreen } from './LiveWatchScreen'
import { trackProductEvent } from '../lib/track'
import './youtube-live.css'
import './live-theater.css'

type Props = {
  performerId: string
  onBack: () => void
  onTip: () => void
  onRequireAuth?: () => void
  allowPublicTest?: boolean
  mini?: boolean
  onMinimize?: () => void
  onRestore?: () => void
  onClose?: () => void
  onEnded?: () => void
}

export function ConnectedLiveWatchScreen(props: Props) {
  const [performer, setPerformer] = useState<Performer | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    void getPerformer(props.performerId, props.allowPublicTest)
      .then((row) => { if (active) { setPerformer(row); setFailed(!row) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [props.performerId, props.allowPublicTest])

  const onPlayerState = useCallback((state: string) => {
    if (state === 'playing') trackProductEvent('live_view_start', { performerId: props.performerId, props: { provider: 'youtube', mode: 'official_embed' } })
  }, [props.performerId])

  if (failed) return <p className="pl-error">配信情報を表示できません。公開設定または通信状態をご確認ください。</p>
  if (!performer) return <p className="pl-muted">Loading…</p>
  // HAKU DIRECT always wins if both are configured, preserving the existing
  // LiveKit viewing path and its access controls without ambiguity.
  if (performer.is_live || !performer.youtube_live_enabled || !performer.youtube_live_video_id || !performer.youtube_live_url) {
    return <LiveWatchScreen {...props} />
  }

  return <main className="pl-youtube-live" data-testid="youtube-live-watch">
    <header className="pl-youtube-live__header">
      <button type="button" className="pl-btn pl-btn--ghost" onClick={props.onBack}><ArrowLeft size={18} /> 戻る</button>
      <div><p>HAKU CONNECT LIVE</p><h1>{performer.stage_name}</h1><span>YouTube公式プレーヤー</span></div>
    </header>
    <YouTubeLivePlayer videoId={performer.youtube_live_video_id} canonicalUrl={performer.youtube_live_url} onStateChange={onPlayerState} />
    <aside className="pl-youtube-live__rail" aria-label="LIVEの応援とコメント案内">
    <section className="pl-youtube-live__support">
      <div><strong>HAKUでパフォーマーを応援</strong><span>YouTubeのSuper Chat等とは別の、HAKU独自の投げ銭です。</span></div>
      <button type="button" className="pl-btn pl-btn--tip" onClick={() => {
        trackProductEvent('tip_cta_click', { performerId: props.performerId, props: { surface: 'youtube_live_companion' } })
        props.onClose?.()
        props.onTip()
      }}><Gift size={19} /> ❤️ HAKUで応援する</button>
    </section>
    <section className="pl-youtube-live__notes">
      <p><ShieldCheck size={17} /> 映像・広告・YouTubeの操作UIはYouTube公式プレーヤーが提供します。HAKUは映像を再配信しません。</p>
      <p>YouTubeのコメント・いいね・Super ChatはYouTube側で利用してください。HAKUのコメント・投げ銭とは別の機能・台帳です。</p>
      <a href={performer.youtube_live_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> YouTube公式画面を開く</a>
    </section>
    </aside>
  </main>
}
