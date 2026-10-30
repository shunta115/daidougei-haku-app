import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { youtubeEmbedUrl, youtubePlayerErrorMessage, parseYouTubeLiveReference } from '../lib/youtubeLive'

type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
type Props = { videoId: string; canonicalUrl: string; onStateChange?: (state: PlayerState) => void }
type YTPlayer = { destroy: () => void }
type YTNamespace = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
}
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

export function YouTubeLivePlayer({ videoId, canonicalUrl: _canonicalUrl, onStateChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onStateChange)
  callbackRef.current = onStateChange
  const [state, setState] = useState<PlayerState>('loading')
  const [error, setError] = useState<string | null>(null)
  const safe = parseYouTubeLiveReference(videoId)
  const canonicalUrl = safe?.canonicalUrl
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !canonicalUrl) return
    let active = true, player: YTPlayer | null = null
    setState('loading'); setError(null)
    const update = (next: PlayerState) => { if (active) { setState(next); callbackRef.current?.(next) } }
    // Own only this iframe; the API can replace/remove it without deleting a React-owned mount.
    const iframe = document.createElement('iframe')
    iframe.title = 'YouTube LIVE'
    iframe.src = youtubeEmbedUrl(videoId, window.location.origin)
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    iframe.allowFullscreen = true
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    mount.replaceChildren(iframe)
    let timer = 0
    const connect = () => {
      if (!active || player || !window.YT?.Player) return
      window.clearTimeout(timer)
      window.clearInterval(interval)
      const YT = window.YT
      player = new YT.Player(iframe, {
        events: {
          onReady: () => { if (active) setError(null); update('ready') },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) update('ended')
            else if (event.data === YT.PlayerState.PLAYING) { if (active) setError(null); update('playing') }
            else if (event.data === YT.PlayerState.BUFFERING) update('buffering')
            else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED) update('paused')
          },
          onAutoplayBlocked: () => { if (active) { setError('自動再生が制限されています。YouTubeの再生ボタンをタップしてください。'); update('paused') } },
          onError: (event: { data: number }) => { if (active) { setError(youtubePlayerErrorMessage(event.data)); update('error') } },
        },
      })
    }
    // Polling avoids overwriting the global callback used by another player/StrictMode mount.
    const interval = window.setInterval(connect, 100)
    connect()
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true
      document.head.appendChild(script)
    }
    timer = window.setTimeout(() => {
      if (!player && active) { setError('YouTubeに接続できませんでした。公式画面で視聴できます。'); update('error') }
    }, 12_000)
    return () => {
      active = false; window.clearTimeout(timer); window.clearInterval(interval)
      player?.destroy(); mount.replaceChildren()
    }
  }, [canonicalUrl, videoId])
  if (!canonicalUrl) return <p role="alert">YouTube動画IDが不正です。URLを登録し直してください。</p>
  return <div className="pl-youtube-player" data-state={state}>
    <div ref={mountRef} className="pl-youtube-player__frame" />
    {state === 'loading' ? <p className="pl-youtube-player__status">YouTubeに接続しています…</p> : null}
    {state === 'ready' || state === 'paused' ? <p>再生・音声はYouTubeプレーヤー内のボタンで操作してください。</p> : null}
    {state === 'ended' ? <p className="pl-youtube-player__notice">このYouTube配信は終了しました。</p> : null}
    {error ? <p className="pl-youtube-player__notice" role="alert">{error}</p> : null}
    <a className="pl-btn pl-btn--ghost pl-youtube-player__external" href={canonicalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> YouTubeで開く（HAKUはこのタブに残ります）</a>
  </div>
}
