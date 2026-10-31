import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ConnectionQuality, RoomEvent, type Room } from 'livekit-client'
import { ArrowDown, ArrowLeft, Gift, Heart, Maximize2, MessageCircle, Minimize2, Send, Share2, SlidersHorizontal, Trash2, UserX, Users } from 'lucide-react'
import { TipGiftOverlay } from '../components/TipGiftOverlay'
import { LiveFeverOverlay } from '../components/LiveFeverOverlay'
import {
  canModerateLiveComments,
  deleteLiveComment,
  follow,
  getActiveLiveSessionId,
  getPerformer,
  isFollowing,
  muteLiveCommentUser,
  postLiveComment,
  subscribePerformerLive,
  unfollow,
  updateLiveViewerPeak,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { spaGo, PLATFORM_PATH } from '../../app/routes'
import { trackProductEvent, useTrackView } from '../lib/track'
import {
  applyNetworkAdaptation,
  attachRemoteTrack,
  connectAsViewer,
  countViewers,
  fetchLiveKitStatus,
  fetchLiveKitToken,
  LiveKitClientError,
  liveKitErrorMessage,
  preferAudioOnly,
  watchRemoteMedia,
} from '../lib/livekit'
import { useFullscreen } from '../lib/useFullscreen'
import { useLiveLayout } from '../lib/useLiveLayout'
import { removeLiveComment, useLiveCommentScroll } from '../lib/useLiveCommentScroll'
import { useVideoAspect } from '../lib/useVideoAspect'
import { useLiveFever } from '../lib/useLiveFever'
import { useLiveComments } from '../lib/useLiveComments'
import { liveLandingUrl, shareLiveUrl } from '../lib/liveShare'
import type { LiveComment, Performer } from '../lib/types'
import './live.css'

type Props = {
  performerId: string
  onBack: () => void
  onTip: () => void
  onRequireAuth?: () => void
  allowPublicTest?: boolean
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LiveWatchScreen({ performerId, onBack, onTip, onRequireAuth, allowPublicTest = false }: Props) {
  const { user, profile } = useAuth()
  const { t } = useLang()
  const { mode, isOverlayChrome } = useLiveLayout()
  const [p, setP] = useState<Performer | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commentsVisible, setCommentsVisible] = useState(true)
  const [muted, setMuted] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [copyUrl, setCopyUrl] = useState<string | null>(null)
  const shareBusy = useRef(false)
  const [requestedLink] = useState(() => ({ performerId, startedAt: new URLSearchParams(window.location.search).get('liveStartedAt') }))
  const requestedLive = requestedLink.performerId === performerId ? requestedLink.startedAt : null
  const wrongSession = Boolean(requestedLive && p?.live_started_at && Date.parse(requestedLive) !== Date.parse(p.live_started_at))
  const liveActive = Boolean(p?.id === performerId && p.is_live && !wrongSession)
  const fever = useLiveFever(performerId, p?.live_started_at, liveActive, user?.id)
  const reaction = fever.hearts.length > 0
  useTrackView('live_view', { performerId }, Boolean(p?.is_live))
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const { comments, setComments, commentError } = useLiveComments(performerId, liveSessionId, liveActive)
  const [canModerate, setCanModerate] = useState(false)
  const [draft, setDraft] = useState('')
  const commentBusy = useRef(false)
  const [commentSending, setCommentSending] = useState(false)
  const [following, setFollowing] = useState(false)
  const followBusy = useRef(false)
  const [followSaving, setFollowSaving] = useState(false)
  const [quality, setQuality] = useState('AUTO')
  // Keep the full broadcast visible by default on narrow phones. Viewers can
  // still opt into the existing crop-to-fill control when they prefer it.
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain')
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('pl-gift-sound') !== '0')
  const [calmMotion, setCalmMotion] = useState(
    () =>
      localStorage.getItem('pl-gift-calm') === '1' ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)

  const shareLive = () => {
    if (shareBusy.current) return
    shareBusy.current = true
    const url = liveLandingUrl(window.location.origin, performerId, requestedLive || p?.live_started_at)
    setCopyUrl(null); setShareStatus('')
    // Call Web Share directly in the tap handler to preserve Safari user activation.
    void shareLiveUrl(url, p?.stage_name || 'HAKU LIVE').then(result => {
      setShareStatus(result === 'copied' ? 'LIVEのURLをコピーしました。' : result === 'shared' ? '共有先にLIVEのURLを渡しました。' : '')
    }).catch(() => { setCopyUrl(url); setShareStatus('URLを選択してコピーしてください。') })
      .finally(() => { shareBusy.current = false })
  }
  const sendLike = () => {
    if (!user) {
      if (onRequireAuth) onRequireAuth()
      else spaGo(`${PLATFORM_PATH}?auth=1&watch=${encodeURIComponent(performerId)}`)
      return
    }
    fever.sendLike()
  }
  const toggleAudio = () => {
    const next = !muted
    setMuted(next)
    if (audioRef.current) {
      audioRef.current.muted = next
      if (!next) void audioRef.current.play().catch(() => setError('音声を再生できません。端末の音量と出力先を確認してください。'))
    }
  }
  const roomRef = useRef<Room | null>(null)
  const { ratio, orientation: videoOrient } = useVideoAspect(videoRef, 9 / 16)
  const fs = useFullscreen(screenRef)
  const commentScroll = useLiveCommentScroll(comments.length, comments.at(-1)?.id, liveSessionId)

  useEffect(() => {
    let alive = true, reading = false
    const refresh = async () => {
      if (reading) return
      reading = true
      try { const row = await getPerformer(performerId, allowPublicTest); if (alive) setP(row) }
      catch { if (alive) setError('LIVE情報を読み込めませんでした。通信を確認してください。') }
      finally { reading = false }
    }
    const recover = () => { if (document.visibilityState !== 'hidden') void refresh() }
    void refresh()
    const timer = window.setInterval(recover, 10000)
    window.addEventListener('online', recover); document.addEventListener('visibilitychange', recover)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('online', recover); document.removeEventListener('visibilitychange', recover) }
  }, [performerId, allowPublicTest])

  useEffect(() => {
    return subscribePerformerLive(performerId, (row) => {
      setP((prev) => (prev?.id === performerId ? { ...prev, ...row } : prev))
      if (row.is_live === false) {
        setLiveSessionId(null)
        setComments([])
        setError(t('liveEndedMsg'))
        const room = roomRef.current
        roomRef.current = null
        if (room) void room.disconnect()
      }
    })
  }, [performerId])

  useEffect(() => {
    if (!user) return
    isFollowing(user.id, performerId).then(setFollowing).catch(() => setFollowing(false))
  }, [user, performerId])

  useEffect(() => {
    setLiveSessionId(null)
    if (!liveActive) return
    let active = true, resolving = false
    const resolve = async () => {
      if (resolving) return
      resolving = true
      try { const id = await getActiveLiveSessionId(performerId); if (active) setLiveSessionId(id) }
      catch { if (active) setError('LIVEセッションを確認できません。通信回復後に再取得します。') }
      finally { resolving = false }
    }
    void resolve()
    const timer = window.setInterval(() => void resolve(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [liveActive, p?.live_started_at, performerId])

  useEffect(() => {
    if (!liveSessionId || !user?.id) {
      setCanModerate(false)
      return
    }
    canModerateLiveComments(liveSessionId, user.id).then(setCanModerate).catch(() => setCanModerate(false))
  }, [liveSessionId, user?.id])

  useEffect(() => {
    if (!liveActive) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const status = await fetchLiveKitStatus()
        if (cancelled) return
        if (!status.configured) {
          setError(liveKitErrorMessage('not_configured'))
          return
        }
        const { token, url } = await fetchLiveKitToken(performerId, false)
        if (cancelled) return
        const room = await connectAsViewer(url, token)
        if (cancelled) {
          await room.disconnect()
          return
        }
        roomRef.current = room
        setViewers(countViewers(room))
        room.on(RoomEvent.ParticipantConnected, () => setViewers(countViewers(room)))
        room.on(RoomEvent.ParticipantDisconnected, () => setViewers(countViewers(room)))
        let lostSince: number | null = null
        room.on(RoomEvent.ConnectionQualityChanged, () => {
          const q = room.localParticipant.connectionQuality
          if (q === ConnectionQuality.Lost) {
            if (lostSince == null) lostSince = Date.now()
            if (Date.now() - lostSince > 4000) {
              preferAudioOnly(room)
              setQuality('AUDIO+')
              return
            }
          } else {
            lostSince = null
          }
          setQuality(applyNetworkAdaptation(room, q))
        })
        setQuality(applyNetworkAdaptation(room, room.localParticipant.connectionQuality))
        watchRemoteMedia(room, (track) => {
          attachRemoteTrack(track, videoRef.current, audioRef.current)
        })
      } catch (e) {
        if (cancelled) return
        if (e instanceof LiveKitClientError) setError(e.message)
        else setError(liveKitErrorMessage('unknown', e instanceof Error ? e.message : undefined))
      }
    })()
    return () => {
      cancelled = true
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
    }
  }, [liveActive, p?.live_started_at, performerId, t])

  useEffect(() => {
    if (!p?.is_live || viewers <= 0) return
    void updateLiveViewerPeak(performerId, viewers).catch(() => undefined)
  }, [viewers, p?.is_live, performerId])

  useEffect(() => {
    if (!p?.live_started_at || !p.is_live) return
    const start = new Date(p.live_started_at).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [p?.live_started_at, p?.is_live])

  useEffect(() => {
    localStorage.setItem('pl-gift-sound', soundOn ? '1' : '0')
  }, [soundOn])
  useEffect(() => {
    localStorage.setItem('pl-gift-calm', calmMotion ? '1' : '0')
  }, [calmMotion])

  const toggleFollow = async () => {
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth()
        return
      }
      spaGo(`${PLATFORM_PATH}?auth=1`)
      return
    }
    if (followBusy.current) return
    followBusy.current = true; setFollowSaving(true)
    trackProductEvent('follow_click', { performerId, props: { surface: 'live' } })
    try {
      if (following) await unfollow(user.id, performerId)
      else await follow(user.id, performerId)
      setFollowing(!following)
    } catch {
      setError('フォローを更新できませんでした。通信を確認して、もう一度お試しください。')
    } finally { followBusy.current = false; setFollowSaving(false) }
  }

  const sendComment = async () => {
    if (!user || !profile || !liveActive || !draft.trim() || !liveSessionId || commentBusy.current) return
    commentBusy.current = true; setCommentSending(true)
    const sentDraft = draft
    try {
      await postLiveComment({
        performerId,
        userId: user.id,
        displayName: profile.display_name,
        body: draft,
        liveSessionId,
      })
      setDraft(current => current === sentDraft ? '' : current)
    } catch {
      setError('コメントを送信できませんでした。このLIVEでのコメント権限または通信状態を確認してください。')
    } finally { commentBusy.current = false; setCommentSending(false) }
  }

  const removeComment = async (commentId: string) => {
    try {
      await deleteLiveComment(commentId)
      setComments((prev) => removeLiveComment(prev, commentId))
    } catch {
      setError('コメントを削除できませんでした。権限と通信を確認してください。')
    }
  }

  const muteCommenter = async (comment: LiveComment) => {
    if (!liveSessionId || !user || comment.user_id === user.id) return
    try {
      await muteLiveCommentUser({ liveSessionId, userId: comment.user_id, mutedBy: user.id })
      await deleteLiveComment(comment.id)
      setComments((prev) => removeLiveComment(prev, comment.id))
    } catch {
      setError('このLIVEでユーザーをミュートできませんでした。権限と通信を確認してください。')
    }
  }

  if (!p && !error) return <p className="pl-muted">Loading…</p>

  const stageClass = [
    'pl-live__stage',

  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={screenRef}
      className={`pl-live pl-live--watch${fs.fallback ? ' pl-live--fs-fallback' : ''}${isOverlayChrome || fs.active ? ' pl-live--immersive' : ''}`}
      data-layout={mode}
      data-video-orientation={videoOrient}
      style={
        {
          '--video-aspect': String(ratio),
          '--video-fit': objectFit,
        } as CSSProperties
      }
    >
      <div
        ref={stageRef}
        className={stageClass}
      >
        <video ref={videoRef} className="pl-live__video" poster={p?.photo_url ?? undefined} playsInline autoPlay />
        <audio ref={audioRef} autoPlay muted={muted} />
        {settingsOpen ? <div className="pl-live__settings" role="region" aria-label="LIVE設定パネル" onClick={event => event.stopPropagation()}>
          <button type="button" onClick={() => setSettingsOpen(false)}>設定を閉じる</button>
          <label><input type="checkbox" checked={objectFit === 'cover'} onChange={event => setObjectFit(event.target.checked ? 'cover' : 'contain')} />映像を画面いっぱいに表示（端が切れます）</label>
          <button type="button" onClick={() => setCommentsVisible(value => !value)}>{commentsVisible ? 'コメントを非表示' : 'コメントを表示'}</button>
          <button type="button" onClick={toggleAudio}>{muted ? '音声を再生' : '音声をミュート'}</button>
          <small>音量はiPhone本体の音量ボタンで調整してください。画質: {quality}</small>
        </div> : null}
        <TipGiftOverlay performerId={performerId} soundEnabled={soundOn} reducedMotion={calmMotion} onGift={fever.addGift} />
        <LiveFeverOverlay level={fever.level} likes={fever.likes} synced={fever.synced} hearts={fever.hearts} reducedMotion={calmMotion} />

        <div className="pl-live__chrome pl-live__hud-top" data-dim={false}>
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft size={19} />
          </button>
          <div className="pl-live__hud-actions">
            <div className="pl-live__stats">
              {liveActive ? <span className="pl-live__pill">{t('liveNow')}</span> : <span className="pl-live__pill pl-live__pill--off">{t('liveEnded')}</span>}
              <span>{formatDuration(elapsed)}</span>
              <span><Users size={13} /> {viewers}</span>
            </div>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
              aria-label="LIVE設定" aria-expanded={settingsOpen}
              onClick={(e) => {
                e.stopPropagation()
                setSettingsOpen(open => !open)
              }}
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
              aria-label={fs.active ? "全画面を終了" : "全画面表示"}
              onClick={(e) => {
                e.stopPropagation()
                void fs.toggle()
              }}
            >
              {fs.active ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>

        {!isOverlayChrome ? (
          <div className="pl-live__titlebar">
            <strong>{p?.stage_name}</strong>
            <span>{p?.live_title || p?.genre || ''}</span>
          </div>
        ) : null}

        <aside className="pl-live__side-actions" aria-label="LIVEアクション">
          <button type="button" disabled={!liveActive} onClick={sendLike} aria-label="無料のいいねを送る"><Heart size={23} fill={reaction ? 'currentColor' : 'none'} /><small>LIKE</small></button>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.pl-live__composer input')?.focus()} aria-label="コメント"><MessageCircle size={23} /><small>{comments.length || 'コメント'}</small></button>
          <button type="button" className="pl-live__side-support" onClick={onTip} aria-label="応援する"><Gift size={23} /><small>応援</small></button>
          <button type="button" onClick={shareLive} aria-label="シェア"><Share2 size={23} /><small>シェア</small></button>
        </aside>
      </div>

      <div className="pl-live__panel pl-live__panel--live" data-dim={false}>
        <div className="pl-live__creator-mini">
          {p?.photo_url ? <img src={p.photo_url} alt="" /> : <span aria-hidden="true">{p?.stage_name?.slice(0, 2) || 'DH'}</span>}
          <div>
            <strong>{p?.stage_name || 'LIVE'}</strong>
            <small>{p?.live_title || p?.genre || 'いま起きているパフォーマンス'}</small>
          </div>
          {liveActive ? <em>LIVE</em> : null}
          <button type="button" className="pl-live__follow" disabled={followSaving} aria-pressed={following} onClick={() => void toggleFollow()}>{following ? t('following') : t('follow')}</button>
        </div>
        <div className="pl-live__comments-wrap" hidden={!commentsVisible}>
          <div ref={commentScroll.listRef} className="pl-live__comments" onScroll={commentScroll.onScroll} aria-live="polite">
            {comments.map((c) => (
              <div key={c.id} className="pl-live__comment">
                <span><strong>{c.display_name}</strong> {c.body}</span>
                {canModerate ? <span className="pl-live__comment-actions">
                  {c.user_id !== user?.id ? <button type="button" onClick={() => void muteCommenter(c)} aria-label={`${c.display_name}をこのLIVEでミュート`} title="このLIVEでミュート"><UserX size={14} /></button> : null}
                  <button type="button" onClick={() => void removeComment(c.id)} aria-label={`${c.display_name}のコメントを削除`} title="コメントを削除"><Trash2 size={14} /></button>
                </span> : null}
              </div>
            ))}
          </div>
          {commentScroll.hasNewComments ? <button type="button" className="pl-live__latest-comments" onClick={() => commentScroll.scrollToLatest()}><ArrowDown size={14} /> 最新コメント</button> : null}
        </div>
        <div className="pl-live__actions">
          <button type="button" className={`pl-live__react${reaction ? ' pl-live__react--on' : ''}`} disabled={!liveActive} onClick={sendLike} aria-label="無料のいいねを送る">
            <span aria-hidden="true">♥</span> いいね
          </button>
          <button
            type="button"
            className="pl-btn pl-btn--tip pl-live__support-cta"
            onClick={() => {
              trackProductEvent('tip_cta_click', { performerId, props: { surface: 'live_bottom_bar' } })
              if (!user) {
                window.sessionStorage.setItem('pl-tip-to', performerId)
                if (onRequireAuth) {
                  onRequireAuth()
                  return
                }
                spaGo(`${PLATFORM_PATH}?auth=1&tipTo=${encodeURIComponent(performerId)}`)
                return
              }
              onTip()
            }}
          >
            <Gift size={18} /> 応援
          </button>
          <button type="button" className="pl-btn pl-btn--ghost" disabled={followSaving} onClick={() => void toggleFollow()}>
            <Heart size={17} fill={following ? 'currentColor' : 'none'} /> {following ? t('following') : t('follow')}
          </button>
        </div>
        <div className="pl-live__composer">
          <input
            className="pl-input"
            style={{ marginBottom: 0 }}
            placeholder={t('commentPlaceholder')}
            value={draft}
            disabled={!user || !liveActive || !liveSessionId || commentSending}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void sendComment()
            }}
          />
          <button type="button" className="pl-btn" disabled={!user || !liveActive || !liveSessionId || commentSending} onClick={() => void sendComment()}>
            <Send size={18} /><span className="pl-live__send-label">{t('send')}</span>
          </button>
        </div>
        <div className="pl-live__prefs">
          <span>{quality} · {videoOrient === 'landscape' ? '横映像' : videoOrient === 'portrait' ? '縦映像' : '映像'}</span>
          <label>
            <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
            ギフト音
          </label>
          <label>
            <input type="checkbox" checked={calmMotion} onChange={(e) => setCalmMotion(e.target.checked)} />
            演出を抑える
          </label>
        </div>
      </div>
      {wrongSession || p && !p.is_live ? <div className="pl-live__ended" role="status">
        <p>このLIVEは終了しました。</p>
        <button type="button" className="pl-btn" onClick={() => spaGo(`${PLATFORM_PATH}?profile=${encodeURIComponent(performerId)}`)}>配信者のプロフィールを見る</button>
        <button type="button" className="pl-btn" onClick={onBack}>LIVE一覧へ戻る</button>
      </div> : null}
      {shareStatus || fever.deliveryError || commentError ? <p className="pl-live__delivery" role="status">{shareStatus || fever.deliveryError || commentError}{shareStatus ? <button type="button" aria-label="共有結果を閉じる" onClick={() => setShareStatus('')}>閉じる</button> : null}</p> : null}
      {copyUrl ? <input className="pl-input pl-live__copy-url" aria-label="LIVE共有URL" readOnly value={copyUrl} onFocus={event => event.currentTarget.select()} /> : null}
      {error ? (
        <p className="pl-error">
          {error}
          {!user ? (
            <>
              {' '}
              <button type="button" className="pl-btn" onClick={() => spaGo(`${PLATFORM_PATH}?auth=1`)}>
                {t('signIn')}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
