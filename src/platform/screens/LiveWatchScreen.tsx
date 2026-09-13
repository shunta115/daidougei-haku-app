import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ConnectionQuality, RoomEvent, type Room } from 'livekit-client'
import { TipGiftOverlay } from '../components/TipGiftOverlay'
import {
  follow,
  getPerformer,
  isFollowing,
  listLiveComments,
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
import { useVideoAspect } from '../lib/useVideoAspect'
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
  const { user, profile } = useAuth()
  const { t } = useLang()
  const { mode, isOverlayChrome } = useLiveLayout()
  const [p, setP] = useState<Performer | null>(null)
  useTrackView('live_view', { performerId }, Boolean(p?.is_live))
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [draft, setDraft] = useState('')
  const [following, setFollowing] = useState(false)
  const [quality, setQuality] = useState('AUTO')
  const [chromeVisible, setChromeVisible] = useState(true)
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
  const roomRef = useRef<Room | null>(null)
  const hideTimer = useRef<number | null>(null)
  const { ratio, orientation: videoOrient } = useVideoAspect(videoRef, 9 / 16)
  const fs = useFullscreen(stageRef)

  useEffect(() => {
    getPerformer(performerId)
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
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
    listLiveComments(performerId).then(setComments).catch(() => undefined)
    return subscribeLiveComments(performerId, (row) => {
      setComments((prev) => [...prev.slice(-79), row])
    })
  }, [performerId])

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Follow failed')
    }
  }

  const sendComment = async () => {
    if (!user || !profile || !draft.trim()) return
    try {
      await postLiveComment({
        performerId,
        userId: user.id,
        displayName: profile.display_name,
        body: draft,
      })
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コメント失敗')
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
        <video ref={videoRef} className="pl-live__video" playsInline autoPlay />
        <audio ref={audioRef} autoPlay />
        <TipGiftOverlay performerId={performerId} soundEnabled={soundOn} reducedMotion={calmMotion} />

        <div className="pl-live__chrome pl-live__hud-top" data-dim={isOverlayChrome && !chromeVisible}>
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack}>
            {t('back')}
          </button>
          <div className="pl-live__hud-actions">
            <div className="pl-live__stats">
              {p?.is_live ? <span className="pl-live__pill">{t('liveNow')}</span> : <span className="pl-live__pill pl-live__pill--off">{t('liveEnded')}</span>}
              <span>{formatDuration(elapsed)}</span>
              <span>👁 {viewers}</span>
              <span>{quality}</span>
              <span>{videoOrient === 'landscape' ? '横映像' : videoOrient === 'portrait' ? '縦映像' : '映像'}</span>
            </div>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
              onClick={(e) => {
                e.stopPropagation()
                setObjectFit((f) => (f === 'contain' ? 'cover' : 'contain'))
              }}
            >
              {objectFit === 'contain' ? 'Fit' : 'Fill'}
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-live__chip"
              onClick={(e) => {
                e.stopPropagation()
                void fs.toggle()
              }}
            >
              {fs.active ? '全画面解除' : '全画面'}
            </button>
          </div>
        </div>

        {!isOverlayChrome ? (
          <div className="pl-live__titlebar">
            <strong>{p?.stage_name}</strong>
            <span>{p?.live_title || p?.genre || ''}</span>
          </div>
        ) : null}
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
        <div className="pl-live__comments">
          {comments.map((c) => (
            <div key={c.id} className="pl-live__comment">
              <strong>{c.display_name}</strong> {c.body}
            </div>
          ))}
        </div>
        <div className="pl-live__actions">
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
            ❤️ 応援する
          </button>
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void toggleFollow()}>
            {following ? t('following') : t('follow')}
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
            {t('send')}
          </button>
        </div>
        <div className="pl-live__prefs">
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
