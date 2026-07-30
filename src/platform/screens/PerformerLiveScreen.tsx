import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { TipGiftOverlay } from '../components/TipGiftOverlay'
import {
  endLive,
  listLiveComments,
  postLiveComment,
  startLive,
  subscribeLiveComments,
  updateLiveViewerPeak,
  updatePerformer,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  applyNetworkAdaptation,
  connectAsHost,
  countViewers,
  fetchLiveKitStatus,
  fetchLiveKitToken,
  LiveKitClientError,
  liveKitErrorMessage,
} from '../lib/livekit'
import { useLiveLayout } from '../lib/useLiveLayout'
import { useVideoAspect } from '../lib/useVideoAspect'
import type { LiveComment } from '../lib/types'
import './live.css'

type Props = {
  onBack: () => void
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PerformerLiveScreen({ onBack }: Props) {
  const { performer, profile, refreshProfile } = useAuth()
  const { mode, isOverlayChrome, orientation: deviceOrient } = useLiveLayout()
  const [title, setTitle] = useState(performer?.live_title ?? '')
  const [phase, setPhase] = useState<'ready' | 'live'>(performer?.is_live ? 'live' : 'ready')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [draft, setDraft] = useState('')
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('pl-gift-sound') !== '0')
  const [calmMotion, setCalmMotion] = useState(
    () =>
      localStorage.getItem('pl-gift-calm') === '1' ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const roomRef = useRef<Room | null>(null)
  const { ratio, orientation: videoOrient } = useVideoAspect(videoRef, deviceOrient === 'landscape' ? 16 / 9 : 9 / 16)
  const startedAtRef = useRef<number>(
    performer?.live_started_at ? new Date(performer.live_started_at).getTime() : Date.now(),
  )
  const endingRef = useRef(false)
  const peakRef = useRef(0)
  const reconnectAttempted = useRef(false)

  useEffect(() => {
    if (performer?.is_live) {
      setPhase('live')
      if (performer.live_started_at) {
        startedAtRef.current = new Date(performer.live_started_at).getTime()
      }
      if (performer.live_title) setTitle(performer.live_title)
    }
  }, [performer?.is_live, performer?.live_started_at, performer?.live_title])

  useEffect(() => {
    if (phase !== 'live') return
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      if (roomRef.current) {
        const n = Math.max(0, countViewers(roomRef.current) - 1)
        setViewers(n)
        if (n > peakRef.current) {
          peakRef.current = n
          if (performer) void updateLiveViewerPeak(performer.id, n).catch(() => undefined)
        }
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase, performer])

  useEffect(() => {
    if (!performer || phase !== 'live') return
    listLiveComments(performer.id).then(setComments).catch(() => undefined)
    return subscribeLiveComments(performer.id, (row) => {
      setComments((prev) => [...prev.slice(-79), row])
    })
  }, [performer, phase])

  const attachLocalPreview = (room: Room) => {
    const pub = [...room.localParticipant.trackPublications.values()].find((p) => p.kind === 'video')
    const track = pub?.track
    if (track && videoRef.current) track.attach(videoRef.current)
  }

  const wireRoom = (room: Room) => {
    roomRef.current = room
    room.on(RoomEvent.ParticipantConnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
    room.on(RoomEvent.ParticipantDisconnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
    room.on(RoomEvent.ConnectionQualityChanged, () => {
      applyNetworkAdaptation(room, room.localParticipant.connectionQuality)
    })
    attachLocalPreview(room)
  }

  const connectHostRoom = async () => {
    if (!performer) throw new Error('No performer')
    const status = await fetchLiveKitStatus()
    if (!status.configured) {
      throw new LiveKitClientError('not_configured', liveKitErrorMessage('not_configured'))
    }
    const { token, url } = await fetchLiveKitToken(performer.id, true)
    const room = await connectAsHost(url, token)
    wireRoom(room)
    return room
  }

  // Rejoin camera if DB says live but room is gone (e.g. remount / refresh).
  useEffect(() => {
    if (!performer?.is_live || reconnectAttempted.current) return
    if (roomRef.current) return
    reconnectAttempted.current = true
    let cancelled = false
    ;(async () => {
      try {
        setBusy(true)
        setError(null)
        await connectHostRoom()
        if (!cancelled) setPhase('live')
      } catch (e) {
        if (!cancelled) {
          if (e instanceof LiveKitClientError) setError(e.message)
          else setError(liveKitErrorMessage('connection', e instanceof Error ? e.message : undefined))
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot rejoin
  }, [performer?.id, performer?.is_live])

  useEffect(() => {
    return () => {
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
    }
  }, [])

  if (!performer || !profile) return <p className="pl-muted">Loading…</p>

  const goLive = async () => {
    if (!performer.is_approved) {
      setError('管理者の承認後にLIVEできます')
      return
    }
    setBusy(true)
    setError(null)
    endingRef.current = false
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (performer.share_location && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
          })
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          /* optional */
        }
      }
      await updatePerformer(performer.id, {
        share_location: performer.share_location,
        lat,
        lng,
        location_updated_at: lat != null ? new Date().toISOString() : null,
      })

      if (!roomRef.current) {
        await connectHostRoom()
      } else {
        attachLocalPreview(roomRef.current)
      }

      await startLive(performer.id, title)
      if (!performer.is_live) {
        startedAtRef.current = Date.now()
        peakRef.current = 0
      }
      setPhase('live')
      await refreshProfile()
    } catch (e) {
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
      if (e instanceof LiveKitClientError) setError(e.message)
      else setError(liveKitErrorMessage('unknown', e instanceof Error ? e.message : 'LIVE開始に失敗しました'))
    } finally {
      setBusy(false)
    }
  }

  const stopLive = async () => {
    setBusy(true)
    setError(null)
    endingRef.current = true
    try {
      const room = roomRef.current
      roomRef.current = null
      if (room) await room.disconnect()
      await endLive(performer.id)
      await refreshProfile()
      setPhase('ready')
      setElapsed(0)
      setViewers(0)
      peakRef.current = 0
      reconnectAttempted.current = false
    } catch (e) {
      endingRef.current = false
      setError(e instanceof Error ? e.message : 'LIVE終了に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const sendComment = async () => {
    if (!draft.trim()) return
    try {
      await postLiveComment({
        performerId: performer.id,
        userId: profile.id,
        displayName: profile.display_name || performer.stage_name,
        body: draft,
      })
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コメント送信に失敗')
    }
  }

  return (
    <div
      className={`pl-live${isOverlayChrome ? ' pl-live--immersive' : ''}`}
      data-layout={mode}
      style={{ '--video-aspect': String(ratio), '--video-fit': 'contain' } as CSSProperties}
    >
      <div className="pl-live__stage">
        <video ref={videoRef} className="pl-live__video" playsInline muted autoPlay />
        {phase === 'live' && performer ? (
          <TipGiftOverlay performerId={performer.id} soundEnabled={soundOn} reducedMotion={calmMotion} />
        ) : null}
        {phase === 'ready' ? <div className="pl-live__placeholder">カメラ準備</div> : null}
        <div className="pl-live__hud-top">
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack}>
            Back
          </button>
          {phase === 'live' ? (
            <div className="pl-live__stats">
              <span className="pl-live__pill">LIVE中</span>
              <span>{formatDuration(elapsed)}</span>
              <span>👁 {viewers}</span>
              <span>{videoOrient === 'landscape' || deviceOrient === 'landscape' ? '横向き配信中' : '縦向き配信中'}</span>
            </div>
          ) : null}
        </div>
      </div>

      {phase === 'ready' ? (
        <div className="pl-live__panel">
          <h1 className="pl-h1">LIVE開始</h1>
          <p className="pl-muted">URL不要。カメラとマイクだけで、いま配信を始めます。</p>
          <label>
            <span className="pl-label">タイトル（任意）</span>
            <input
              className="pl-input"
              value={title}
              maxLength={80}
              placeholder="今日の大道芸"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <p className="pl-muted">現在地共有: {performer.share_location ? 'ON' : 'OFF'}（Homeで切替）</p>
          <button type="button" className="pl-btn pl-btn--block pl-btn--live" disabled={busy} onClick={() => void goLive()}>
            {busy ? 'Starting…' : 'LIVE START'}
          </button>
        </div>
      ) : (
        <div className="pl-live__panel pl-live__panel--live">
          {!roomRef.current && busy ? <p className="pl-muted">カメラ再接続中…</p> : null}
          <div className="pl-live__comments">
            {comments.map((c) => (
              <div key={c.id} className="pl-live__comment">
                <strong>{c.display_name}</strong> {c.body}
              </div>
            ))}
          </div>
          <div className="pl-live__composer">
            <input
              className="pl-input"
              style={{ marginBottom: 0 }}
              placeholder="コメント"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendComment()
              }}
            />
            <button type="button" className="pl-btn" onClick={() => void sendComment()}>
              Send
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
          <button type="button" className="pl-btn pl-btn--block pl-btn--danger" disabled={busy} onClick={() => void stopLive()}>
            ライブ終了
          </button>
        </div>
      )}
      {error ? <p className="pl-error">{error}</p> : null}
    </div>
  )
}
