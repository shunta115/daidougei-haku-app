import { useEffect, useState } from 'react'
import {
  beginYouTubeOAuth,
  completeYouTubeOAuth,
  deleteYouTubeDestination,
  disconnectYouTubeOAuth,
  confirmYouTubeBroadcastState,
  getMultiLiveDestination,
  getYouTubeBroadcastState,
  saveYouTubeDestination,
  type MultiLiveDestinationStatus,
  type YouTubeBroadcastState,
} from '../lib/multiLive'

type Props = {
  status: MultiLiveDestinationStatus | null
  onStatus: (status: MultiLiveDestinationStatus | null) => void
}

const STATUS_LABELS: Record<string, string> = {
  unconfigured: '未設定', ready: '開始準備完了', starting: '接続中', live: 'YouTubeへ配信中', failed: '接続失敗', stopped: '停止済み',
}

export function MultiLivePanel({ status, onStatus }: Props) {
  const [streamKey, setStreamKey] = useState('')
  const [displayName, setDisplayName] = useState('YouTube LIVE')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')
  const [enabled, setEnabled] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broadcast, setBroadcast] = useState<YouTubeBroadcastState | null>(null)

  useEffect(() => {
    let active = true
    void getMultiLiveDestination()
      .then((next) => {
        if (!active) return
        onStatus(next)
        setDisplayName(next.displayName || 'YouTube LIVE')
        setVisibility(next.visibility || 'public')
        setEnabled(next.enabled)
      })
      .catch(() => { if (active) onStatus(null) })
    return () => { active = false }
  }, [onStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const completionToken = params.get('youtube_oauth_completion')
    if (!completionToken) return
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    let active = true
    setBusy(true)
    void completeYouTubeOAuth(completionToken)
      .then(() => getMultiLiveDestination())
      .then((next) => { if (active) onStatus(next) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'YouTube認証を完了できませんでした。') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [onStatus])

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const next = await saveYouTubeDestination({ streamKey, displayName, visibility, enabled })
      onStatus(next); setStreamKey(''); setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('YouTube配信先と保存済みOAuth連携を削除しますか？')) return
    setBusy(true); setError(null)
    try { await deleteYouTubeDestination(); onStatus(null); setEditing(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '削除できませんでした。') }
    finally { setBusy(false) }
  }

  const disconnect = async () => {
    setBusy(true); setError(null)
    try { await disconnectYouTubeOAuth(); onStatus(status ? { ...status, oauthConnected: false } : status) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '解除できませんでした。') }
    finally { setBusy(false) }
  }

  const verifyBroadcast = async (confirm: boolean) => {
    setBusy(true); setError(null)
    try {
      const inspected = confirm && broadcast
        ? await confirmYouTubeBroadcastState(broadcast.id)
        : await getYouTubeBroadcastState()
      setBroadcast(inspected)
      if (inspected.confirmed) {
        onStatus(status ? {
          ...status,
          actualVisibility: inspected.privacyStatus,
          broadcastId: inspected.id,
          visibilityConfirmed: true,
        } : status)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'YouTube公開範囲を確認できませんでした。')
    } finally { setBusy(false) }
  }

  return <section className="pl-card pl-multi-live" aria-labelledby="multi-live-title">
    <div className="pl-multi-live__header">
      <div><strong id="multi-live-title">同時配信先</strong><p className="pl-muted">HAKU LIVEは常に継続し、外部配信の失敗だけを分離します。</p></div>
      <span className="pl-multi-live__status" data-status={status?.status || 'unconfigured'}>{STATUS_LABELS[status?.status || 'unconfigured']}</span>
    </div>
    {status?.configured && !editing ? <div className="pl-multi-live__summary">
      <p><strong>YouTube</strong> · {status.displayName} · 公開範囲: {status.visibility === 'public' ? '公開' : status.visibility === 'unlisted' ? '限定公開' : '非公開'}</p>
      <p className="pl-muted">配信キー: 保存済み（画面には再表示しません）</p>
      {status.lastErrorCode ? <p className="pl-error" role="alert">YouTube接続エラー: {status.lastErrorCode}</p> : null}
      <div className="pl-multi-live__actions">
        <button type="button" className="pl-btn pl-btn--ghost" disabled={busy || status.status === 'live'} onClick={() => setEditing(true)}>設定変更</button>
        {!status.oauthConnected ? <button type="button" className="pl-btn" disabled={busy} onClick={() => void beginYouTubeOAuth().catch((cause) => setError(cause instanceof Error ? cause.message : '接続できませんでした。'))}>YouTubeコメント連携</button> : <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void disconnect()}>コメント連携を解除</button>}
        <button type="button" className="pl-btn pl-btn--ghost" disabled={busy || status.status === 'live'} onClick={() => void remove()}>削除</button>
      </div>
      {status.oauthConnected ? <p className="pl-muted">公式OAuth接続済み。YouTubeコメントとSuper Chatは外部イベントとして表示し、HAKUのStripe投げ銭台帳には記録しません。</p> : null}
      {status.oauthConnected ? <div className="pl-multi-live__visibility-check">
        <button type="button" className="pl-btn" disabled={busy} onClick={() => void verifyBroadcast(false)}>YouTubeの実際の公開範囲を確認</button>
        {broadcast ? <div role="status">
          <p><strong>{broadcast.title}</strong> · 実際: {broadcast.privacyStatus === 'public' ? '公開' : broadcast.privacyStatus === 'unlisted' ? '限定公開' : '非公開'} · 状態: {broadcast.lifeCycleStatus}</p>
          {!broadcast.visibilityMatches ? <p className="pl-error">HAKUで選択した公開範囲と一致しません。YouTube Studioで修正して再確認してください。</p> : null}
          {broadcast.visibilityMatches && !broadcast.confirmed ? <button type="button" className="pl-btn pl-btn--live" disabled={busy} onClick={() => void verifyBroadcast(true)}>このYouTube公開範囲を確認して同時配信を許可</button> : null}
          {broadcast.confirmed ? <p className="pl-registration__notice">公開範囲を確認済みです。この配信への同時配信を開始できます。</p> : null}
        </div> : status.visibilityConfirmed ? <p className="pl-registration__notice">YouTube公開範囲を確認済みです。開始時にもサーバーで再検証します。</p> : <p className="pl-muted">同時配信前にYouTube側の実際の公開範囲を確認し、明示的に許可してください。</p>}
      </div> : null}
    </div> : <div className="pl-multi-live__form">
      <label><span className="pl-label">表示名</span><input className="pl-input" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span className="pl-label">YouTubeストリームキー</span><input className="pl-input" type="password" autoComplete="off" value={streamKey} onChange={(event) => setStreamKey(event.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" /></label>
      <p className="pl-muted">キーはサーバーで暗号化し、保存後はブラウザへ返しません。</p>
      <label><span className="pl-label">YouTube側の公開範囲</span><select className="pl-input" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="public">公開</option><option value="unlisted">限定公開</option><option value="private">非公開</option></select></label>
      <label className="pl-live__location-consent"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>LIVE開始時にYouTubeへ同時配信</strong><small>HAKU側の視聴権限は変更されません</small></span></label>
      <div className="pl-multi-live__actions"><button type="button" className="pl-btn" disabled={busy || !streamKey} onClick={() => void save()}>{busy ? '保存中…' : '安全に保存'}</button>{status?.configured ? <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setEditing(false)}>キャンセル</button> : null}</div>
    </div>}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    <details><summary>TikTok LIVEについて</summary><p className="pl-muted">公式の外部配信権限とLIVE APIが確認できたアカウントのみ将来有効化します。非公式APIやセッションCookieは使用しません。</p></details>
  </section>
}
