import { useEffect, useRef, useState } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { endLive, listLiveComments, postLiveComment, startLive, subscribeLiveComments, updatePerformer } from '../lib/api'
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
  const [title, setTitle] = useState(performer?.live_title ?? '')
  const [phase, setPhase] = useState<'ready' | 'live'>('ready')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [draft, setDraft] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const roomRef = useRef<Room | null>(null)
  const startedAtRef = useRef<number>(Date.now())

  useEffect(() => {
    if (performer?.is_live) setPhase('live')
  }, [performer?.is_live])

  useEffect(() => {
    if (phase !== 'live') return
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      if (roomRef.current) setViewers(Math.max(0, countViewers(roomRef.current) - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (!performer || phase !== 'live') return
    listLiveComments(performer.id).then(setComments).catch(() => undefined)
    return subscribeLiveComments(performer.id, (row) => {
      setComments((prev) => [...prev.slice(-79), row])
    })
  }, [performer, phase])

  useEffect(() => {
    return () => {
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
    }
  }, [])

  if (!performer || !profile) return <p className="pl-muted">Loading…</p>

  const attachLocalPreview = (room: Room) => {
    const pub = [...room.localParticipant.trackPublications.values()].find((p) => p.kind === 'video')
    const track = pub?.track
    if (track && videoRef.current) {
      track.attach(videoRef.current)
    }
  }

  const goLive = async () => {
    if (!performer.is_approved) {
      setError('管理者の承認後にLIVEできます')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const status = await fetchLiveKitStatus()
      if (!status.configured) {
        throw new LiveKitClientError('not_configured', liveKitErrorMessage('not_configured'))
      }

      // Permissions + camera via LiveKit
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

      const { token, url } = await fetchLiveKitToken(performer.id, true)
      const room = await connectAsHost(url, token)
      roomRef.current = room
      room.on(RoomEvent.ParticipantConnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
      room.on(RoomEvent.ParticipantDisconnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
      room.on(RoomEvent.ConnectionQualityChanged, () => {
        applyNetworkAdaptation(room, room.localParticipant.connectionQuality)
      })
      attachLocalPreview(room)

      await startLive(performer.id, title)
      startedAtRef.current = Date.now()
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
    try {
      const room = roomRef.current
      roomRef.current = null
      if (room) await room.disconnect()
      await endLive(performer.id)
      await refreshProfile()
      setPhase('ready')
      setElapsed(0)
      setViewers(0)
    } catch (e) {
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
    <div className="pl-live">
      <div className="pl-live__stage">
        <video ref={videoRef} className="pl-live__video" playsInline muted autoPlay />
        {!phase || phase === 'ready' ? <div className="pl-live__placeholder">カメラ準備</div> : null}
        <div className="pl-live__hud-top">
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack}>
            Back
          </button>
          {phase === 'live' ? (
            <div className="pl-live__stats">
              <span className="pl-live__pill">LIVE</span>
              <span>{formatDuration(elapsed)}</span>
              <span>👁 {viewers}</span>
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
          <button type="button" className="pl-btn pl-btn--block pl-btn--danger" disabled={busy} onClick={() => void stopLive()}>
            ライブ終了
          </button>
        </div>
      )}
      {error ? <p className="pl-error">{error}</p> : null}
    </div>
  )
}
