import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Link2, Radio, Trash2, Video } from 'lucide-react'
import { saveYouTubeLiveSettings, youtubeLivePublishError, type YouTubeLiveSettings } from '../lib/youtubeLivePublish'
import type { Performer } from '../lib/types'
import { parseYouTubeLiveReference } from '../lib/youtubeLive'
import { YouTubeLivePlayer } from './YouTubeLivePlayer'

type Props = {
  performer: Performer
  onBack: () => void
  onChooseDirect: () => void
  onPreview: () => void
  onSaved: () => Promise<void>
}

export function YouTubeLiveSetup({ performer, onBack, onChooseDirect, onPreview, onSaved }: Props) {
  const [input, setInput] = useState(performer.youtube_live_url ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => parseYouTubeLiveReference(input), [input])
  const saving = useRef(false)
  const [saved, setSaved] = useState<YouTubeLiveSettings>({
    youtube_live_video_id: performer.youtube_live_video_id ?? null,
    youtube_live_url: performer.youtube_live_url ?? null,
    youtube_live_enabled: Boolean(performer.youtube_live_enabled),
  })
  const savedId = saved.youtube_live_video_id
  const published = Boolean(saved.youtube_live_enabled && savedId && saved.youtube_live_url)

  const refresh = async () => {
    try { await onSaved() } catch {
      setError('保存は完了しましたが、画面の再読み込みに失敗しました。通信状態を確認して画面を開き直してください。')
    }
  }
  const changed = parsed?.videoId !== savedId

  const publish = async () => {
    if (saving.current) return
    if (!parsed) {
      setError('YouTube LIVEのURLを確認してください。「共有」からコピーしたURLをそのまま貼り付けられます。')
      return
    }
    saving.current = true
    setBusy(true); setError(null); setMessage(null)
    try {
      setSaved(await saveYouTubeLiveSettings(performer.id, {
        youtube_live_video_id: parsed.videoId,
        youtube_live_url: parsed.canonicalUrl,
        youtube_live_enabled: true,
      }))
      setInput(parsed.canonicalUrl)
      await refresh()
      setMessage('公開しました。ファンはHAKU内でこのYouTube LIVEを視聴できます。')
    } catch (error) {
      setError(youtubeLivePublishError(error))
    } finally { saving.current = false; setBusy(false) }
  }

  const setPublished = async (enabled: boolean) => {
    if (!savedId || !saved.youtube_live_url || saving.current) return
    saving.current = true
    setBusy(true); setError(null); setMessage(null)
    try {
      setSaved(await saveYouTubeLiveSettings(performer.id, { youtube_live_enabled: enabled }))
      await refresh()
      setMessage(enabled ? 'HAKUでの公開を再開しました。' : 'HAKUでの公開を停止しました。YouTube側の配信には影響しません。')
    } catch (error) {
      setError(youtubeLivePublishError(error))
    } finally { saving.current = false; setBusy(false) }
  }

  const unlink = async () => {
    if (saving.current || !window.confirm('YouTube LIVE連携を解除しますか？YouTube側の配信は終了しません。')) return
    saving.current = true
    setBusy(true); setError(null); setMessage(null)
    try {
      setSaved(await saveYouTubeLiveSettings(performer.id, {
        youtube_live_video_id: null,
        youtube_live_url: null,
        youtube_live_enabled: false,
      }))
      setInput('')
      await refresh()
      setMessage('YouTube LIVE連携を解除しました。')
    } catch (error) {
      setError(youtubeLivePublishError(error))
    } finally { saving.current = false; setBusy(false) }
  }

  return <main className="pl-youtube-setup">
    <header className="pl-youtube-setup__header">
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>戻る</button>
      <div><p>LIVE管理</p><h1>YouTube LIVE連携</h1><span>YouTubeで配信して、URLを貼るだけ</span></div>
    </header>

    <div className="pl-live-methods" role="radiogroup" aria-label="配信方法">
      <button type="button" role="radio" aria-checked="false" onClick={onChooseDirect}>
        <Video aria-hidden="true" /><span><strong>HAKU DIRECT LIVE</strong><small>HAKUのカメラ・マイクで直接配信</small></span>
      </button>
      <button type="button" role="radio" aria-checked="true" data-selected="true">
        <Radio aria-hidden="true" /><span><strong>YouTube LIVE連携</strong><small>YouTubeで配信し、HAKUで視聴・応援</small></span><CheckCircle2 aria-hidden="true" />
      </button>
    </div>

    <ol className="pl-youtube-setup__steps">
      <li><b>1</b><span><strong>YouTubeでLIVE配信</strong><small>YouTubeアプリでいつもどおり配信します</small></span></li>
      <li data-done={Boolean(parsed)}><b>2</b><span><strong>URLを貼り付け</strong><small>YouTubeの「共有」→「コピー」</small></span></li>
      <li data-done={published && !changed}><b>3</b><span><strong>HAKUで公開</strong><small>ファンがHAKU内で視聴できます</small></span></li>
    </ol>

    <section className="pl-youtube-setup__form">
      <label htmlFor="youtube-live-url"><span className="pl-label">YouTube LIVEのURL</span></label>
      <div className="pl-youtube-setup__input">
        <Link2 aria-hidden="true" />
        <input id="youtube-live-url" className="pl-input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://youtube.com/live/..." value={input} disabled={busy} onChange={(event) => { setInput(event.target.value); setError(null); setMessage(null) }} />
      </div>
      {input && !parsed ? <p className="pl-error" role="alert">YouTube LIVEのURLを確認してください。チャンネルURLではなく、配信動画の共有URLを貼り付けます。</p> : null}
      {parsed ? <p className="pl-youtube-setup__valid"><CheckCircle2 size={17} /> 動画IDを確認しました：{parsed.videoId}</p> : null}
    </section>

    {parsed ? <section className="pl-youtube-setup__preview" aria-label="YouTube LIVEプレビュー">
      <h2>公開前のプレビュー</h2>
      <YouTubeLivePlayer key={parsed.videoId} videoId={parsed.videoId} canonicalUrl={parsed.canonicalUrl} />
    </section> : null}

    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {message ? <p className="pl-registration__notice" role="status">{message}</p> : null}

    <div className="pl-youtube-setup__actions">
      <button type="button" className="pl-btn pl-btn--live pl-btn--block" disabled={!parsed || busy} onClick={() => void publish()}>
        {busy ? '保存しています…' : published && !changed ? 'このURLで公開中' : 'HAKUで公開する'}
      </button>
      {savedId && !changed ? <label className="pl-youtube-setup__toggle">
        <span><strong>HAKUで公開</strong><small>OFFでもYouTube側の配信は停止しません</small></span>
        <input type="checkbox" role="switch" checked={published} disabled={busy} onChange={(event) => void setPublished(event.target.checked)} />
      </label> : null}
      {published && !changed ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" onClick={onPreview}><ExternalLink size={17} /> 登録したLIVEを確認</button> : null}
      {savedId ? <button type="button" className="pl-btn pl-btn--ghost pl-btn--block pl-youtube-setup__unlink" disabled={busy} onClick={() => void unlink()}><Trash2 size={17} /> 連携を解除</button> : null}
    </div>
    <p className="pl-youtube-setup__help">ストリームキーやGoogleログインは不要です。YouTubeの公開範囲と埋め込み許可はYouTube Studioで設定してください。</p>
  </main>
}
