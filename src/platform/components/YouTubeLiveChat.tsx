import { useEffect, useRef, useState } from 'react'
import { getYouTubeChat, postYouTubeChat, type YouTubeChatItem } from '../lib/multiLive'

export function YouTubeLiveChat({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<YouTubeChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string>()

  useEffect(() => {
    if (!enabled) return
    let active = true
    let timer = 0
    const poll = async () => {
      try {
        const result = await getYouTubeChat(tokenRef.current)
        if (!active) return
        tokenRef.current = result.nextPageToken
        setItems((previous) => {
          const merged = new Map(previous.map((item) => [item.id, item]))
          result.items.forEach((item) => merged.set(item.id, item))
          return [...merged.values()].slice(-100)
        })
        setError(null)
        timer = window.setTimeout(() => void poll(), result.pollingIntervalMillis)
      } catch {
        if (!active) return
        setError('YouTubeコメントを再接続しています…')
        timer = window.setTimeout(() => void poll(), 10_000)
      }
    }
    void poll()
    return () => { active = false; window.clearTimeout(timer) }
  }, [enabled])

  if (!enabled) return null
  const send = async () => {
    if (!draft.trim()) return
    try { await postYouTubeChat(draft); setDraft(''); setError(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'YouTubeへ返信できませんでした。') }
  }

  return <section className="pl-youtube-chat" aria-label="YouTube LIVEチャット">
    <div className="pl-youtube-chat__title"><strong>YouTube LIVEチャット</strong><span>外部サービス</span></div>
    <div className="pl-youtube-chat__messages" aria-live="polite">
      {items.length === 0 ? <p className="pl-muted">YouTubeのコメントを待っています…</p> : items.map((item) => <div key={item.id} className="pl-youtube-chat__message" data-paid={Boolean(item.externalRevenue)}>
        <span className="pl-youtube-chat__source">YouTube</span> <strong>{item.displayName}</strong> {item.message}
        {item.externalRevenue ? <small>Super Chat（YouTube） {item.externalRevenue.displayAmount || ''} · HAKU投げ銭とは別会計</small> : null}
      </div>)}
    </div>
    <div className="pl-live__composer"><input className="pl-input" value={draft} maxLength={200} placeholder="YouTubeへ返信" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} /><button type="button" className="pl-btn" onClick={() => void send()}>返信</button></div>
    {error ? <p className="pl-muted" role="status">{error}</p> : null}
  </section>
}
