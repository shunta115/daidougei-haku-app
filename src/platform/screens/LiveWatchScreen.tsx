import { useEffect, useRef, useState } from 'react'
import { ConnectionQuality, RoomEvent, type Room } from 'livekit-client'
import {
  follow,
  getPerformer,
  isFollowing,
  listLiveComments,
  postLiveComment,
  subscribeLiveComments,
  subscribePerformerLive,
  unfollow,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  attachRemoteTrack,
  connectAsViewer,
  countViewers,
  fetchLiveKitToken,
  isLiveKitConfigured,
  preferAudioOnWeakNetwork,
  watchRemoteMedia,
} from '../lib/livekit'
import type { LiveComment, Performer } from '../lib/types'
import './live.css'

type Props = {
  performerId: string
  onBack: () => void
  onTip: () => void
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LiveWatchScreen({ performerId, onBack, onTip }: Props) {
  const { user, profile } = useAuth()
  const [p, setP] = useState<Performer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [draft, setDraft] = useState('')
  const [following, setFollowing] = useState(false)
  const [quality, setQuality] = useState('AUTO')
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const roomRef = useRef<Room | null>(null)

  useEffect(() => {
    getPerformer(performerId)
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [performerId])

  useEffect(() => {
    return subscribePerformerLive(performerId, (row) => {
      setP((prev) => (prev ? { ...prev, ...row } : prev))
      if (row.is_live === false) {
        setError('このライブは終了しました')
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
    if (!isLiveKitConfigured()) {
      setError('LiveKit未設定です')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
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
        room.on(RoomEvent.ConnectionQualityChanged, () => {
          const q = room.localParticipant.connectionQuality
          const weak = q === ConnectionQuality.Poor || q === ConnectionQuality.Lost
          preferAudioOnWeakNetwork(room, weak)
          setQuality(weak ? 'AUDIO+' : 'AUTO')
        })
        watchRemoteMedia(room, (track) => {
          attachRemoteTrack(track, videoRef.current, audioRef.current)
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '視聴に失敗しました')
      }
    })()
    return () => {
      cancelled = true
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
    }
  }, [p?.is_live, performerId])

  useEffect(() => {
    if (!p?.live_started_at || !p.is_live) return
    const start = new Date(p.live_started_at).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [p?.live_started_at, p?.is_live])

  const toggleFollow = async () => {
    if (!user) return
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

  return (
    <div className="pl-live pl-live--watch">
      <div className="pl-live__stage">
        <video ref={videoRef} className="pl-live__video" playsInline autoPlay />
        <audio ref={audioRef} autoPlay />
        <div className="pl-live__hud-top">
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack}>
            Back
          </button>
          <div className="pl-live__stats">
            {p?.is_live ? <span className="pl-live__pill">LIVE</span> : <span className="pl-live__pill pl-live__pill--off">END</span>}
            <span>{formatDuration(elapsed)}</span>
            <span>👁 {viewers}</span>
            <span>{quality}</span>
          </div>
        </div>
        <div className="pl-live__titlebar">
          <strong>{p?.stage_name}</strong>
          <span>{p?.live_title || p?.genre || ''}</span>
        </div>
      </div>

      <div className="pl-live__panel pl-live__panel--live">
        <div className="pl-live__comments">
          {comments.map((c) => (
            <div key={c.id} className="pl-live__comment">
              <strong>{c.display_name}</strong> {c.body}
            </div>
          ))}
        </div>
        <div className="pl-live__actions">
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void toggleFollow()} disabled={!user}>
            {following ? 'Following' : 'Follow'}
          </button>
          <button type="button" className="pl-btn" onClick={onTip}>
            投げ銭
          </button>
        </div>
        <div className="pl-live__composer">
          <input
            className="pl-input"
            style={{ marginBottom: 0 }}
            placeholder="コメント"
            value={draft}
            disabled={!user}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendComment()
            }}
          />
          <button type="button" className="pl-btn" disabled={!user} onClick={() => void sendComment()}>
            Send
          </button>
        </div>
      </div>
      {error ? <p className="pl-error">{error}</p> : null}
    </div>
  )
}
