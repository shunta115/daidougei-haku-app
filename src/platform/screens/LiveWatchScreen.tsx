import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ConnectionQuality, RoomEvent, type Room } from 'livekit-client'
import { ArrowLeft, Eye, EyeOff, Gift, Heart, Maximize2, MessageCircle, Minimize2, Send, Share2, SlidersHorizontal, Trash2, Users, VolumeX } from 'lucide-react'
import { TipGiftOverlay } from '../components/TipGiftOverlay'
import {
  deleteLiveComment,
  follow,
  getOpenLiveSessionId,
  getPerformer,
  isFollowing,
  listLiveComments,
  postLiveComment,
  subscribeLiveComments,
  subscribeLiveCommentDeletes,
  subscribePerformerLive,
  unfollow,
  updateLiveViewerPeak,
} from '../lib/api'
import { useLiveReactions } from '../lib/useLiveReactions'
import { LiveApplauseMeter, LiveReactionEffects } from '../components/LiveReactionEffects'
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
import { useVideoAspect } from '../lib/useVideoAspect'
import { useVisualKeyboardInset } from '../lib/useVisualKeyboardInset'
import type { LiveComment, Performer } from '../lib/types'
import './live.css'

type Props = {
  performerId: string
  onBack: () => void
  onTip: () => void
  onRequireAuth?: () => void
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LiveWatchScreen({ performerId, onBack, onTip, onRequireAuth }: Props) {
  useVisualKeyboardInset()
  const { user, profile } = useAuth()
  const { t } = useLang()
  const { mode, isOverlayChrome } = useLiveLayout()
  const [p, setP] = useState<Performer | null>(null)
  const reactions = useLiveReactions(performerId, p?.live_started_at, Boolean(p?.is_live), {
    id: user?.id,
    displayName: profile?.display_name,
    privateLive: p?.is_private_test === true,
  })
  const reaction = reactions.pulses.length > 0
  const [showReactionHint, setShowReactionHint] = useState(() => localStorage.getItem('pl-live-applause-hint') !== 'seen')
  const [commentSending, setCommentSending] = useState(false)
  const commentBusyRef = useRef(false)
  const commentSentAtRef = useRef(0)
  useTrackView('live_view', { performerId }, Boolean(p?.is_live))
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [commentsVisible, setCommentsVisible] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [mutedCommenters, setMutedCommenters] = useState<Set<string>>(() => new Set())
  const [following, setFollowing] = useState(false)
  const [quality, setQuality] = useState('AUTO')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('cover')
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('pl-live-effect-sound') === '1')
  const [calmMotion, setCalmMotion] = useState(
    () =>
      localStorage.getItem('pl-gift-calm') === '1' ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<HTMLDivElement>(null)

  const shareLive = () => {
    const url = `${window.location.origin}${PLATFORM_PATH}?watch=${encodeURIComponent(performerId)}`
    if (navigator.share) void navigator.share({ title: p?.stage_name || '大道芸博 LIVE', text: 'このLIVEを一緒に見よう。', url }).catch(() => undefined)
    else void navigator.clipboard?.writeText(url)
  }
  const roomRef = useRef<Room | null>(null)
  const hideTimer = useRef<number | null>(null)
  const { ratio, orientation: videoOrient } = useVideoAspect(videoRef, 9 / 16)
  const fs = useFullscreen(stageRef)

  useEffect(() => {
    getPerformer(performerId)
      .then(setP)
      .catch(() => setError('LIVE情報を読み込めませんでした。通信を確認して、もう一度開いてください。'))
  }, [performerId])

  useEffect(() => {
    return subscribePerformerLive(performerId, (row) => {
      setP((prev) => (prev ? { ...prev, ...row } : prev))
      if (row.is_live === false) {
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
    if (!p?.is_live) {
      setLiveSessionId(null)
      setComments([])
      return
    }
    let active = true
    let retry: number | null = null
    const resolveSession = async () => {
      try {
        const id = await getOpenLiveSessionId(performerId)
        if (!active) return
        if (id) setLiveSessionId(id)
        else retry = window.setTimeout(() => void resolveSession(), 500)
      } catch {
        if (active) setError('LIVEセッションを確認できませんでした。通信を確認してください。')
      }
    }
    setComments([])
    setLiveSessionId(null)
    void resolveSession()
    return () => {
      active = false
      if (retry != null) window.clearTimeout(retry)
    }
  }, [performerId, p?.is_live, p?.live_started_at])

  useEffect(() => {
    if (!liveSessionId) return
    let active = true
    listLiveComments(performerId, liveSessionId).then((rows) => { if (active) setComments(rows) }).catch(() => {
      if (active) setError('コメントを読み込めませんでした。通信を確認してください。')
    })
    const unsubscribeInsert = subscribeLiveComments(performerId, liveSessionId, (row) => {
      setComments((prev) => prev.some((comment) => comment.id === row.id) ? prev : [...prev.slice(-79), row])
    })
    const unsubscribeDelete = subscribeLiveCommentDeletes(performerId, liveSessionId, (id) => {
      setComments((prev) => prev.filter((comment) => comment.id !== id))
    })
    return () => {
      active = false
      unsubscribeInsert()
      unsubscribeDelete()
    }
  }, [performerId, liveSessionId])

  useEffect(() => {
    if (!commentsVisible || !autoScroll) return
    const node = commentsRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [comments, commentsVisible, autoScroll])

  useEffect(() => {
    if (!p?.is_live) return
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
  }, [p?.is_live, performerId, t])

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
    localStorage.setItem('pl-live-effect-sound', soundOn ? '1' : '0')
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
    if (!user || !profile || !p?.is_live || !liveSessionId || !draft.trim() || commentBusyRef.current || Date.now() - commentSentAtRef.current < 1000) return
    commentBusyRef.current = true; setCommentSending(true)
    try {
      await postLiveComment({
        performerId,
        userId: user.id,
        displayName: profile.display_name,
        body: draft,
        liveSessionId,
      })
      setDraft('')
      commentSentAtRef.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コメント失敗')
    } finally {
      commentBusyRef.current = false; setCommentSending(false)
    }
  }

  const sendReaction = (kind: 'heart' | 'applause') => {
    reactions.send(kind)
    if (kind === 'applause') { setShowReactionHint(false); localStorage.setItem('pl-live-applause-hint', 'seen') }
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
        {liveSessionId ? <TipGiftOverlay performerId={performerId} liveSessionId={liveSessionId} soundEnabled={soundOn} reducedMotion={calmMotion} /> : null}

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

        <LiveReactionEffects pulses={reactions.pulses} level={reactions.level} celebrating={reactions.celebrating} reducedMotion={calmMotion} />

        <aside className="pl-live__side-actions" aria-label="LIVEアクション">
          <button type="button" disabled={!p?.is_live} onClick={() => sendReaction('applause')} aria-label="タップして拍手（無料）"><span aria-hidden="true">👏</span><small>拍手</small></button>
          <button type="button" disabled={!p?.is_live} onClick={() => sendReaction('heart')} aria-label="ハートを送る（無料）"><Heart size={23} fill={reaction ? 'currentColor' : 'none'} /><small>ハート</small></button>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.pl-live__composer input')?.focus()} aria-label="コメント"><MessageCircle size={23} /><small>{comments.length || 'コメント'}</small></button>
          <button type="button" className="pl-live__side-support" onClick={onTip} aria-label="応援する"><Gift size={23} /><small>応援</small></button>
          <button type="button" onClick={shareLive} aria-label="シェア"><Share2 size={23} /><small>シェア</small></button>
        </aside>
      </div>

      <div className="pl-live__panel pl-live__panel--live" data-dim={isOverlayChrome && !chromeVisible}>
        <LiveApplauseMeter total={reactions.total} level={reactions.level} celebrating={reactions.celebrating} />
        {showReactionHint && p?.is_live ? <p className="pl-live__reaction-hint">👏を押してパフォーマーを応援！</p> : null}
        {reactions.deliveryError ? <p className="pl-error" role="status">{reactions.deliveryError}</p> : null}
        <div className="pl-live__creator-mini">
          {p?.photo_url ? <img src={p.photo_url} alt="" /> : <span aria-hidden="true">{p?.stage_name?.slice(0, 2) || 'DH'}</span>}
          <div>
            <strong>{p?.stage_name || 'LIVE'}</strong>
            <small>{p?.live_title || p?.genre || 'いま起きているパフォーマンス'}</small>
          </div>
          {p?.is_live ? <em>LIVE</em> : null}
        </div>
        <div className="pl-live__comment-tools">
          <button type="button" onClick={() => setCommentsVisible((visible) => !visible)}>
            {commentsVisible ? <EyeOff size={14} /> : <Eye size={14} />} {commentsVisible ? 'コメントを隠す' : 'コメントを表示'}
          </button>
          {commentsVisible ? (
            <button type="button" aria-pressed={autoScroll} onClick={() => setAutoScroll((enabled) => !enabled)}>
              自動スクロール {autoScroll ? 'ON' : 'OFF'}
            </button>
          ) : null}
          {mutedCommenters.size > 0 ? (
            <button type="button" onClick={() => setMutedCommenters(new Set())}>ミュート解除 ({mutedCommenters.size})</button>
          ) : null}
        </div>
        {commentsVisible ? (
          <div
            ref={commentsRef}
            className="pl-live__comments"
            onScroll={(event) => {
              const node = event.currentTarget
              setAutoScroll(node.scrollHeight - node.scrollTop - node.clientHeight < 28)
            }}
          >
            {comments.filter((comment) => !mutedCommenters.has(comment.user_id)).map((c) => (
              <div key={c.id} className="pl-live__comment">
                <span><strong>{c.display_name}</strong> {c.body}</span>
                <span className="pl-live__comment-actions">
                  {c.user_id === user?.id ? (
                    <button type="button" aria-label="コメントを削除" onClick={() => void deleteLiveComment(c.id).catch(() => setError('コメントを削除できませんでした。'))}>
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`${c.display_name}をミュート`}
                    onClick={() => setMutedCommenters((previous) => new Set(previous).add(c.user_id))}
                  >
                    <VolumeX size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="pl-live__actions">
          <button type="button" className={`pl-live__react${reaction ? ' pl-live__react--on' : ''}`} disabled={!p?.is_live} onClick={() => sendReaction('applause')} aria-label="タップして拍手（無料）">
            <span aria-hidden="true">👏</span> タップして拍手！
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
            disabled={!user || !p?.is_live || !liveSessionId || commentSending}
            maxLength={200}
            onFocus={bumpChrome}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendComment()
            }}
          />
          <button type="button" className="pl-btn" disabled={!user || !p?.is_live || !liveSessionId || commentSending} onClick={() => void sendComment()}>
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
