import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyLiveUrl, createLiveStory, type StoryDetails, storyStatus } from '../lib/liveStory'
import './liveStoryShare.css'

export function LiveStoryShare({ name, url, live, onClose }: StoryDetails & { onClose: () => void }) {
  const [art, setArt] = useState<{ blob: Blob; src: string; key: string } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const key = JSON.stringify([name, url, live])
  const ready = art?.key === key ? art : null
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    let active = true
    let src: string | undefined
    setMessage('')
    createLiveStory({ name, url, live }).then(blob => {
      if (!active) return
      src = URL.createObjectURL(blob)
      setArt({ blob, src, key })
    }).catch(() => { if (active) setMessage('画像を作成できませんでした。URLをコピーして共有できます。') })
    return () => { active = false; if (src) URL.revokeObjectURL(src) }
  }, [name, url, live, key])
  const file = ready ? new File([ready.blob], 'haku-live-story.png', { type: 'image/png' }) : null
  const canShare = !!file && !!navigator.share && !!navigator.canShare?.({ files: [file] })
  const shareImage = async () => {
    if (!file || busy) return
    setBusy(true)
    try {
      // Invoke directly from the tap; async image generation/clipboard would lose iOS activation.
      await navigator.share({ files: [file] })
      setMessage('投稿が完了していない場合は、Instagramでストーリーを選んでください。')
    } catch (error) {
      if (!(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) setMessage('画像を長押しして保存し、Instagramのストーリーで選んでください。')
    } finally { setBusy(false) }
  }
  return createPortal(<div className="haku-story-backdrop" onClick={onClose}>
    <section className="haku-story" role="dialog" aria-modal="true" aria-labelledby="haku-story-title" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }}>
      <button ref={closeRef} type="button" className="haku-story-close" onClick={onClose} aria-label="共有を閉じる">閉じる</button>
      <h2 id="haku-story-title">Instagramストーリーで共有</h2>
      <p>① URLをコピー → ② 画像を共有・保存 → ③ Instagramのストーリーに追加</p>
      {ready ? <img src={ready.src} alt={`${name}の共有画像：${storyStatus(live)}`} /> : <p role="status">画像を準備しています…</p>}
      <button type="button" onClick={() => void copyLiveUrl(url).then(copied => setMessage(copied ? '視聴URLをコピーしました。Instagramの「リンク」スタンプに貼り付けてください。' : '表示されたURLをコピーしてください。'))}>視聴URLをコピー</button>
      {canShare && <button type="button" disabled={busy} onClick={() => void shareImage()}>画像を共有（Instagramを選択）</button>}
      {ready && <a href={ready.src} download="haku-live-story.png">共有画像を保存</a>}
      <p>保存できない場合は画像を長押しして「写真に保存」。Instagramで「＋」→「ストーリーズ」から画像を選び、「リンク」スタンプに視聴URLを貼り付けてください。</p>
      <p>共有先にInstagramが出ない場合も、写真から投稿できます。画像内のURLはタップできません。</p>
      <p role="status">{message}</p>
    </section>
  </div>, document.fullscreenElement || document.body)
}
