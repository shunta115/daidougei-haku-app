import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { youtubeEmbedUrl, youtubePlayerErrorMessage } from '../lib/youtubeLive'

type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

type Props = {
  videoId: string
  canonicalUrl: string
  onStateChange?: (state: PlayerState) => void
}

type YTPlayer = { destroy: () => void }
type YTNamespace = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube IFrame API unavailable'))
    }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    if (existing) return
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('YouTube IFrame API failed to load'))
    document.head.appendChild(script)
  })
  return apiPromise
}

export function YouTubeLivePlayer({ videoId, canonicalUrl, onStateChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PlayerState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let player: YTPlayer | null = null
    const update = (next: PlayerState) => {
      if (!active) return
      setState(next)
      onStateChange?.(next)
    }
    void loadYouTubeApi().then((YT) => {
      if (!active || !mountRef.current) return
      player = new YT.Player(mountRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => update('ready'),
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) update('ended')
            else if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) update('playing')
            else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED) update('paused')
          },
          onError: (event: { data: number }) => {
            setError(youtubePlayerErrorMessage(event.data))
            update('error')
          },
        },
      })
    }).catch(() => {
      setError('YouTubeプレーヤーを読み込めませんでした。通信状態をご確認ください。')
      update('error')
    })
    return () => { active = false; player?.destroy() }
  }, [onStateChange, videoId])

  return <div className="pl-youtube-player" data-state={state}>
    <div ref={mountRef} className="pl-youtube-player__frame">
      <iframe
        title="YouTube LIVE"
        src={youtubeEmbedUrl(videoId, window.location.origin)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
    {state === 'loading' ? <p className="pl-youtube-player__status">YouTubeに接続しています…</p> : null}
    {state === 'ended' ? <p className="pl-youtube-player__notice">このYouTube配信は終了しました。</p> : null}
    {error ? <p className="pl-youtube-player__notice" role="alert">{error}</p> : null}
    {(state === 'ended' || state === 'error') ? <a className="pl-btn pl-btn--ghost pl-youtube-player__external" href={canonicalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> YouTubeで開く</a> : null}
  </div>
}
