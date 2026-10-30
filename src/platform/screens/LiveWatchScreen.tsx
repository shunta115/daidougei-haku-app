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
  listLiveComments,
  muteLiveCommentUser,
  postLiveComment,
  subscribeLiveComments,
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
import { appendLiveComment, removeLiveComment, useLiveCommentScroll } from '../lib/useLiveCommentScroll'
import { useVideoAspect } from '../lib/useVideoAspect'
import { useLiveFever } from '../lib/useLiveFever'
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
  const fever = useLiveFever(performerId, p?.live_started_at, Boolean(p?.is_live))
  const reaction = fever.hearts.length > 0
  useTrackView('live_view', { performerId }, Boolean(p?.is_live))
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const [canModerate, setCanModerate] = useState(false)
  const [draft, setDraft] = useState('')
  const [following, setFollowing] = useState(false)
  const [quality, setQuality] = useState('AUTO')
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [chromeVisible, setChromeVisible] = useState(true)
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

  const startAudio = () => {
    const room = roomRef.current
    if (!room) return
    // Invoke directly inside the user gesture for Safari autoplay permission.
    void room.startAudio().then(() => {
      if (roomRef.current === room) setAudioBlocked(!room.canPlaybackAudio)
    }).catch(() => {
      if (roomRef.current === room) setAudioBlocked(true)
    })
  }

  const shareLive = () => {
    const url = `${window.location.origin}${PLATFORM_PATH}?watch=${encodeURIComponent(performerId)}`
    if (navigator.share) void navigator.share({ title: p?.stage_name || '大道芸博 LIVE', text: 'このLIVEを一緒に見よう。', url }).catch(() => undefined)
    else void navigator.clipboard?.writeText(url)
  }
  const roomRef = useRef<Room | null>(null)
  const hideTimer = useRef<number | null>(null)
  const { ratio, orientation: videoOrient } = useVideoAspect(videoRef, 9 / 16)
  const fs = useFullscreen(stageRef)
  const commentScroll = useLiveCommentScroll(comments.length)

  useEffect(() => {
    getPerformer(performerId, allowPublicTest)
      .then(setP)
      .catch(() => setError('LIVE情報を読み込めませんでした。通信を確認して、もう一度開いてください。'))
  }, [performerId, allowPublicTest])

  useEffect(() => {
    return subscribePerformerLive(performerId, (row) => {
      setP((prev) => (prev ? { ...prev, ...row } : prev))
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
    if (!p?.is_live) return
    let active = true
    void getActiveLiveSessionId(performerId)
      .then((sessionId) => { if (active) setLiveSessionId(sessionId) })
      .catch(() => undefined)
    return () => { active = false }
  }, [p?.is_live, performerId])

  useEffect(() => {
    if (!liveSessionId) return
    listLiveComments(performerId, liveSessionId).then(setComments).catch(() => undefined)
    return subscribeLiveComments(performerId, liveSessionId, {
      onInsert: (row) => setComments((prev) => appendLiveComment(prev, row)),
      onDelete: (commentId) => setComments((prev) => removeLiveComment(prev, commentId)),
    })
  }, [liveSessionId, performerId])

  useEffect(() => {
    if (!liveSessionId || !user?.id) {
      setCanModerate(false)
      return
    }
    canModerateLiveComments(liveSessionId, user.id).then(setCanModerate).catch(() => setCanModerate(false))
  }, [liveSessionId, user?.id])

  useEffect(() => {
    if (!p?.is_live) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        setConnectionState('connecting')
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
        setConnectionState('connected')
        const updateAudio = () => setAudioBlocked(!room.canPlaybackAudio)
        room.on(RoomEvent.AudioPlaybackStatusChanged, updateAudio)
        room.on(RoomEvent.Reconnecting, () => { if (!cancelled) setConnectionState('reconnecting') })
        room.on(RoomEvent.SignalReconnecting, () => { if (!cancelled) setConnectionState('reconnecting') })
        room.on(RoomEvent.Reconnected, () => { if (!cancelled) setConnectionState('connected') })
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setConnectionState('disconnected')
        })
        updateAudio()
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
        setConnectionState('disconnected')
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
  }, [p?.is_live, performerId, t, connectionAttempt])

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

  const bumpChrome = () => {
    setChromeVisible(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    if (isOverlayChrome) {
      hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3500)
    }
  }

  useEffect(() => {
    if (!isOverlayChrome) {
      setChromeVisible(true)
      return
    }
    bumpChrome()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOverlayChrome])

  const toggleFollow = async () => {
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth()
        return
      }
      spaGo(`${PLATFORM_PATH}?auth=1`)
      return
    }
    trackProductEvent('follow_click', { performerId, props: { surface: 'live' } })
    try {
      if (following) await unfollow(user.id, performerId)
      else await follow(user.id, performerId)
      setFollowing(!following)
    } catch {
      setError('フォローを更新できませんでした。通信を確認して、もう一度お試しください。')
    }
  }

  const sendComment = async () => {
    if (!user || !profile || !draft.trim() || !liveSessionId) return
    try {
      await postLiveComment({
        performerId,
        userId: user.id,
        displayName: profile.display_name,
        body: draft,
        liveSessionId,
      })
      setDraft('')
    } catch {
      setError('コメントを送信できませんでした。このLIVEでのコメント権限または通信状態を確認してください。')
    }
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
    fs.fallback ? 'pl-live__stage--fs-fallback' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`pl-live pl-live--watch${isOverlayChrome || fs.active ? ' pl-live--immersive' : ''}`}
      data-layout={mode}
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
        onClick={() => {
          if (isOverlayChrome) bumpChrome()
        }}
      >
        <video ref={videoRef} className="pl-live__video" poster={p?.photo_url ?? undefined} playsInline autoPlay />
        <audio ref={audioRef} autoPlay />
        <TipGiftOverlay performerId={performerId} soundEnabled={soundOn} reducedMotion={calmMotion} onGift={fever.addGift} />
        <LiveFeverOverlay level={fever.level} likes={fever.likes} hearts={fever.hearts} reducedMotion={calmMotion} />

        <div className="pl-live__chrome pl-live__hud-top" data-dim={isOverlayChrome && !chromeVisible}>
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft size={19} />
          </button>
          <div className="pl-live__hud-actions">
            <div className="pl-live__stats">
              {p?.is_live ? <span className="pl-live__pill">{t('liveNow')}</span> : <span className="pl-live__pill pl-live__pill--off">{t('liveEnded')}</span>}
              <span>{formatDuration(elapsed)}</span>
              <span><Users size={13} /> {viewers}</span>
            </div>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
              onClick={(e) => {
                e.stopPropagation()
                setObjectFit((f) => (f === 'contain' ? 'cover' : 'contain'))
              }}
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
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
          <button type="button" onClick={() => void toggleFollow()} aria-label={following ? 'フォロー解除' : 'フォロー'}><Heart size={23} fill={following ? 'currentColor' : 'none'} /><small>{following ? 'フォロー中' : 'フォロー'}</small></button>
          <button type="button" disabled={!p?.is_live} onClick={fever.sendLike} aria-label="無料のいいねを送る"><Heart size={23} fill={reaction ? 'currentColor' : 'none'} /><small>LIKE</small></button>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.pl-live__composer input')?.focus()} aria-label="コメント"><MessageCircle size={23} /><small>{comments.length || 'コメント'}</small></button>
          <button type="button" className="pl-live__side-support" onClick={onTip} aria-label="応援する"><Gift size={23} /><small>応援</small></button>
          <button type="button" onClick={shareLive} aria-label="シェア"><Share2 size={23} /><small>シェア</small></button>
        </aside>
      </div>

      <div className="pl-live__panel pl-live__panel--live" data-dim={isOverlayChrome && !chromeVisible}>
        <div className="pl-live__creator-mini">
          {p?.photo_url ? <img src={p.photo_url} alt="" /> : <span aria-hidden="true">{p?.stage_name?.slice(0, 2) || 'DH'}</span>}
          <div>
            <strong>{p?.stage_name || 'LIVE'}</strong>
            <small>{p?.live_title || p?.genre || 'いま起きているパフォーマンス'}</small>
          </div>
          {p?.is_live ? <em>LIVE</em> : null}
        </div>
        <div className="pl-live__comments-wrap">
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
        {p?.is_live && audioBlocked ? <button type="button" className="pl-btn pl-btn--block" onClick={startAudio}>タップしてLIVE音声を再生</button> : null}
        {p?.is_live && connectionState === 'reconnecting' ? <p role="status">通信が途切れました。再接続しています…</p> : null}
        {p?.is_live && connectionState === 'disconnected' ? <button type="button" className="pl-btn pl-btn--block" onClick={() => setConnectionAttempt((attempt) => attempt + 1)}>LIVEに再接続</button> : null}
        <div className="pl-live__actions">
          <button type="button" className={`pl-live__react${reaction ? ' pl-live__react--on' : ''}`} disabled={!p?.is_live} onClick={fever.sendLike} aria-label="無料のいいねを送る">
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
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void toggleFollow()}>
            <Heart size={17} fill={following ? 'currentColor' : 'none'} /> {following ? t('following') : t('follow')}
          </button>
        </div>
        <div className="pl-live__composer">
          <input
            className="pl-input"
            style={{ marginBottom: 0 }}
            placeholder={t('commentPlaceholder')}
            value={draft}
            disabled={!user}
            onFocus={bumpChrome}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendComment()
            }}
          />
          <button type="button" className="pl-btn" disabled={!user} onClick={() => void sendComment()}>
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
