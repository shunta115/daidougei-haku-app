import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { ArrowDown, Mic, MicOff, SwitchCamera, Trash2, UserX, Video, VideoOff } from 'lucide-react'
import { TipGiftOverlay } from '../components/TipGiftOverlay'
import { LiveFeverOverlay } from '../components/LiveFeverOverlay'
import { YouTubeLiveSetup } from '../components/YouTubeLiveSetup'
import {
  canModerateLiveComments,
  createLiveSchedule,
  endLive,
  deleteLiveComment,
  getActiveLiveSessionId,
  listLiveComments,
  listPerformerLiveSchedules,
  liveReservationsEnabled,
  muteLiveCommentUser,
  notifyLiveReservationStarted,
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
  liveMediaDeviceErrorMessage,
  restartHostCameraForOrientation,
  setHostCameraEnabled,
  setHostMicrophoneEnabled,
} from '../lib/livekit'
import { useLiveLayout } from '../lib/useLiveLayout'
import { appendLiveComment, removeLiveComment, useLiveCommentScroll } from '../lib/useLiveCommentScroll'
import { useVideoAspect } from '../lib/useVideoAspect'
import { canSwitchHostCamera, hostCameraTrack, switchHostCamera, type CameraFacing } from '../lib/liveCamera'
import { liveOrientationStorage, readLiveOrientationMode, resolveLiveOrientation, writeLiveOrientationMode, type LiveOrientationMode } from '../lib/liveOrientationPreference'
import { useLiveFever } from '../lib/useLiveFever'
import type { LiveComment } from '../lib/types'
import type { LiveSchedule } from '../lib/types'
import { supabaseAuthHeaders } from '../lib/supabase'
import './live.css'

type Props = {
  onBack: () => void
  onPreviewYouTube: () => void
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PerformerLiveScreen({ onBack, onPreviewYouTube }: Props) {
  const { performer, profile, refreshProfile } = useAuth()
  const performerId = performer?.id
  const { mode, isOverlayChrome, orientation: deviceOrient } = useLiveLayout()
  const [orientationMode, setOrientationMode] = useState<LiveOrientationMode>(() =>
    readLiveOrientationMode(liveOrientationStorage()),
  )
  const videoOrientation = resolveLiveOrientation(orientationMode, deviceOrient)
  const [publishedOrientation, setPublishedOrientation] = useState(videoOrientation)
  const [title, setTitle] = useState(performer?.live_title ?? '')
  const [scheduleAt, setScheduleAt] = useState('')
  const [schedules, setSchedules] = useState<LiveSchedule[]>([])
  const [scheduleFeatureAvailable, setScheduleFeatureAvailable] = useState(false)
  const [shareLocation, setShareLocation] = useState(Boolean(performer?.share_location))
  const [phase, setPhase] = useState<'ready' | 'live'>(performer?.is_live ? 'live' : 'ready')
  const [method, setMethod] = useState<'direct' | 'youtube'>(() => performer?.youtube_live_enabled && !performer?.is_live ? 'youtube' : 'direct')
  const [previewState, setPreviewState] = useState<'idle' | 'preparing' | 'ready' | 'denied' | 'ended'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user')
  const [cameraSwitchAvailable, setCameraSwitchAvailable] = useState(false)
  const [switchingCamera, setSwitchingCamera] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const displayOrientation = phase === 'live' && cameraEnabled ? publishedOrientation : videoOrientation
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [privacyPaused, setPrivacyPaused] = useState(false)
  const [cameraRecoveryNeeded, setCameraRecoveryNeeded] = useState(false)
  const cameraSwitchRef = useRef(false)
  const orientationSwitchRef = useRef(false)
  const [comments, setComments] = useState<LiveComment[]>([])
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const [canModerate, setCanModerate] = useState(false)
  const [draft, setDraft] = useState('')
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('pl-gift-sound') !== '0')
  const [calmMotion, setCalmMotion] = useState(
    () =>
      localStorage.getItem('pl-gift-calm') === '1' ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const roomRef = useRef<Room | null>(null)
  useVideoAspect(videoRef, videoOrientation === 'landscape' ? 16 / 9 : 9 / 16)
  const startedAtRef = useRef<number>(
    performer?.live_started_at ? new Date(performer.live_started_at).getTime() : Date.now(),
  )
  const endingRef = useRef(false)
  const peakRef = useRef(0)
  const reconnectAttempted = useRef(false)
  const locationWriteAtRef = useRef(0)
  const appliedOrientationRef = useRef(videoOrientation)
  const failedAutoOrientationRef = useRef<string | null>(null)
  const hiddenAtRef = useRef<number | null>(null)
  const commentScroll = useLiveCommentScroll(comments.length)
  const fever = useLiveFever(performerId, performer?.live_started_at, phase === 'live')

  useEffect(() => {
    if (!liveReservationsEnabled || !performerId || phase !== 'ready') {
      setScheduleFeatureAvailable(false)
      return
    }
    listPerformerLiveSchedules(performerId)
      .then((rows) => { setSchedules(rows); setScheduleFeatureAvailable(true) })
      .catch(() => { setSchedules([]); setScheduleFeatureAvailable(false) })
  }, [performerId, phase])

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
    if (!performer || phase !== 'live' || !shareLocation || !navigator.geolocation?.watchPosition) return
    let active = true
    const writePosition = (position: GeolocationPosition) => {
      const now = Date.now()
      if (!active || now - locationWriteAtRef.current < 15_000) return
      locationWriteAtRef.current = now
      void updatePerformer(performer.id, {
        share_location: true,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        location_updated_at: new Date(now).toISOString(),
      }).catch(() => undefined)
    }
    const watchId = navigator.geolocation.watchPosition(
      writePosition,
      () => undefined,
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 },
    )
    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
    }
  }, [performer, phase, shareLocation])

  useEffect(() => {
    if (!performer || phase !== 'live' || shareLocation) return
    void updatePerformer(performer.id, {
      share_location: false,
      lat: null,
      lng: null,
      location_updated_at: null,
    }).catch(() => undefined)
  }, [performer, phase, shareLocation])

  useEffect(() => {
    if (!performer || phase !== 'live') return
    let active = true
    const heartbeat = async () => {
      try {
        const headers = await supabaseAuthHeaders()
        if (!active) return
        await fetch('/api/livekit/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ performerId: performer.id }),
          keepalive: true,
        })
      } catch {
        // LIVE transport remains independent; the next heartbeat retries automatically.
      }
    }
    void heartbeat()
    const timer = window.setInterval(() => void heartbeat(), 20_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [performer, phase])

  useEffect(() => {
    if (orientationMode !== 'auto' || phase !== 'live' || !cameraEnabled || appliedOrientationRef.current === videoOrientation || failedAutoOrientationRef.current === videoOrientation || orientationSwitchRef.current || mediaBusy) return
    const room = roomRef.current
    if (!room) return
    orientationSwitchRef.current = true
    setMediaBusy(true)
    void restartHostCameraForOrientation(room, cameraFacing, videoOrientation)
      .then((restarted) => {
        if (!restarted) throw new Error('camera_track_unavailable')
        appliedOrientationRef.current = videoOrientation
        setPublishedOrientation(videoOrientation)
        failedAutoOrientationRef.current = null
        attachLocalPreview(room)
      })
      .catch(() => {
        failedAutoOrientationRef.current = videoOrientation
        setError('画面方向に合わせたカメラ調整に失敗しました。現在の映像で配信を継続します。手動で向きを選び直してください。')
      })
      .finally(() => { orientationSwitchRef.current = false; setMediaBusy(false) })
  }, [cameraEnabled, cameraFacing, videoOrientation, orientationMode, mediaBusy, phase])

  useEffect(() => {
    if (phase !== 'live') return
    const stopTracksForPrivacy = () => {
      const room = roomRef.current
      if (!room) return
      hiddenAtRef.current ??= Date.now()
      setPrivacyPaused(true)
      setCameraEnabled(false)
      setMicrophoneEnabled(false)
      void Promise.allSettled([
        setHostCameraEnabled(room, false, cameraFacing, videoOrientation),
        setHostMicrophoneEnabled(room, false),
      ])
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTracksForPrivacy()
        return
      }
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      if (hiddenAt && Date.now() - hiddenAt >= 60_000 && performer) {
        const room = roomRef.current
        roomRef.current = null
        void room?.disconnect()
        void endLive(performer.id)
          .then(refreshProfile)
          .then(() => {
            setPhase('ready')
            setPreviewState('ended')
            setError('バックグラウンド状態が60秒を超えたため、プライバシー保護のためLIVEを終了しました。')
          })
          .catch(() => setError('映像・音声は停止しました。サーバーとの終了同期を確認してください。'))
      } else if (hiddenAt) {
        setError('バックグラウンド移行時にカメラとマイクを停止しました。必要なものだけ再開してください。')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', stopTracksForPrivacy)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', stopTracksForPrivacy)
    }
  }, [cameraFacing, videoOrientation, performer, phase, refreshProfile])

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
    if (!performerId || phase !== 'live' || liveSessionId) return
    let active = true
    void getActiveLiveSessionId(performerId)
      .then((sessionId) => { if (active) setLiveSessionId(sessionId) })
      .catch(() => undefined)
    return () => { active = false }
  }, [liveSessionId, performerId, phase])

  useEffect(() => {
    if (!performerId || phase !== 'live' || !liveSessionId) return
    listLiveComments(performerId, liveSessionId).then(setComments).catch(() => undefined)
    return subscribeLiveComments(performerId, liveSessionId, {
      onInsert: (row) => setComments((prev) => appendLiveComment(prev, row)),
      onDelete: (commentId) => setComments((prev) => removeLiveComment(prev, commentId)),
    })
  }, [liveSessionId, performerId, phase])

  useEffect(() => {
    if (!liveSessionId || !profile?.id) {
      setCanModerate(false)
      return
    }
    canModerateLiveComments(liveSessionId, profile.id).then(setCanModerate).catch(() => setCanModerate(false))
  }, [liveSessionId, profile?.id])

  const attachLocalPreview = (room: Room) => {
    const pub = [...room.localParticipant.trackPublications.values()].find((p) => p.kind === 'video')
    const track = pub?.track
    if (track && videoRef.current) track.attach(videoRef.current)
  }

  const wireRoom = (room: Room) => {
    roomRef.current = room
    setCameraFacing(hostCameraTrack(room)?.mediaStreamTrack.getSettings().facingMode === 'environment' ? 'environment' : 'user')
    void canSwitchHostCamera()
      .then((available) => { if (roomRef.current === room) setCameraSwitchAvailable(available) })
      .catch(() => { if (roomRef.current === room) setCameraSwitchAvailable(false) })
    room.on(RoomEvent.ParticipantConnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
    room.on(RoomEvent.ParticipantDisconnected, () => setViewers(Math.max(0, countViewers(room) - 1)))
    room.on(RoomEvent.ConnectionQualityChanged, () => {
      applyNetworkAdaptation(room, room.localParticipant.connectionQuality)
    })
    room.on(RoomEvent.MediaDevicesError, (mediaError) => {
      if (roomRef.current !== room) return
      setError(liveMediaDeviceErrorMessage(mediaError))
      const cameraTrack = hostCameraTrack(room)
      if (!cameraTrack || cameraTrack.mediaStreamTrack.readyState === 'ended') {
        setCameraEnabled(false)
        setCameraRecoveryNeeded(true)
      }
    })
    attachLocalPreview(room)
    setCameraEnabled(true)
    setMicrophoneEnabled(true)
    setPrivacyPaused(false)
    appliedOrientationRef.current = videoOrientation
    setPublishedOrientation(videoOrientation)
  }

  const connectHostRoom = async () => {
    if (!performer) throw new Error('パフォーマー情報を確認できませんでした。登録状況に戻って再読み込みしてください。')
    const status = await fetchLiveKitStatus()
    if (!status.configured) {
      throw new LiveKitClientError('not_configured', liveKitErrorMessage('not_configured'))
    }
    const { token, url } = await fetchLiveKitToken(performer.id, true)
    const room = await connectAsHost(url, token, videoOrientation)
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
      setError('運営の承認後にLIVEを開始できます。登録状況をご確認ください。')
      return
    }
    setBusy(true)
    setError(null)
    endingRef.current = false
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (shareLocation && 'geolocation' in navigator) {
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
        share_location: shareLocation,
        lat,
        lng,
        location_updated_at: lat != null ? new Date().toISOString() : null,
      })

      if (!roomRef.current) {
        await connectHostRoom()
      } else {
        attachLocalPreview(roomRef.current)
      }

      const sessionId = await startLive(performer.id, title)
      setLiveSessionId(sessionId)
      const matchingSchedule = schedules.find((schedule) =>
        schedule.title.trim() === title.trim()
        && Math.abs(new Date(schedule.scheduled_start_at).getTime() - Date.now()) <= 12 * 60 * 60_000,
      )
      if (sessionId && matchingSchedule) {
        void notifyLiveReservationStarted(matchingSchedule.id, sessionId)
          .then(() => setSchedules((prev) => prev.filter((schedule) => schedule.id !== matchingSchedule.id)))
          .catch(() => undefined)
      }
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
      else setError(liveKitErrorMessage('unknown', e instanceof Error ? e.message : 'LIVEを開始できませんでした。通信を確認してもう一度お試しください。'))
    } finally {
      setBusy(false)
    }
  }

  const preparePreview = async () => {
    if (!performer.is_approved) { setError('運営の承認後にLIVEを開始できます。登録状況をご確認ください。'); return }
    setBusy(true)
    setError(null)
    setPreviewState('preparing')
    try {
      if (!roomRef.current) await connectHostRoom()
      else attachLocalPreview(roomRef.current)
      setPreviewState('ready')
    } catch (e) {
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.disconnect()
      const message = e instanceof Error ? e.message : ''
      const denied = /permission|notallowed|denied|許可/i.test(message)
      setPreviewState(denied ? 'denied' : 'idle')
      setError(denied ? 'カメラまたはマイクが許可されていません。iPhoneの設定でSafariのカメラ・マイクを許可して、もう一度お試しください。' : e instanceof LiveKitClientError ? e.message : 'カメラを準備できませんでした。通信を確認して、もう一度お試しください。')
    } finally { setBusy(false) }
  }

  const scheduleLive = async () => {
    if (!performerId || !title.trim() || !scheduleAt) return
    const startsAt = new Date(scheduleAt)
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < Date.now() + 5 * 60_000) {
      setError('LIVE予約は5分以上先の日時を指定してください。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const row = await createLiveSchedule(performerId, title, startsAt.toISOString())
      setSchedules((prev) => [...prev, row].sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at)))
      setScheduleAt('')
    } catch {
      setError('LIVE予約を作成できませんでした。通信状態を確認してください。')
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
      setPreviewState('ended')
      setElapsed(0)
      setViewers(0)
      setLiveSessionId(null)
      setComments([])
      peakRef.current = 0
      reconnectAttempted.current = false
    } catch (e) {
      endingRef.current = false
      setError('LIVEを終了できませんでした。通信を確認して、もう一度「LIVE終了」を押してください。')
    } finally {
      setBusy(false)
    }
  }

  const switchCamera = async () => {
    const room = roomRef.current
    if (!room || !cameraEnabled || !cameraSwitchAvailable || cameraSwitchRef.current || busy || mediaBusy) return
    cameraSwitchRef.current = true
    setSwitchingCamera(true)
    setError(null)
    try {
      const facing = await switchHostCamera(room, cameraFacing, videoOrientation)
      if (roomRef.current === room) {
        setCameraFacing(facing)
        setCameraRecoveryNeeded(false)
      }
    } catch (e) {
      if (roomRef.current === room) {
        const message = e instanceof Error ? e.message : 'カメラを切り替えられませんでした。'
        setError(message)
        setCameraRecoveryNeeded(/元の映像も復元|frames_not_advancing|processor_unavailable/.test(message))
      }
    } finally {
      cameraSwitchRef.current = false
      setSwitchingCamera(false)
    }
  }

  const toggleMicrophone = async () => {
    const room = roomRef.current
    if (!room || mediaBusy) return
    const next = !microphoneEnabled
    setMediaBusy(true)
    setError(null)
    try {
      await setHostMicrophoneEnabled(room, next)
      setMicrophoneEnabled(next)
      if (next) setPrivacyPaused(false)
    } catch {
      setError(next ? 'マイクを再開できませんでした。マイク権限を確認してください。' : 'マイクを停止できませんでした。')
    } finally {
      setMediaBusy(false)
    }
  }

  const toggleCamera = async () => {
    const room = roomRef.current
    if (!room || mediaBusy || switchingCamera) return
    const next = !cameraEnabled
    setMediaBusy(true)
    setError(null)
    try {
      await setHostCameraEnabled(room, next, cameraFacing, videoOrientation)
      setCameraEnabled(next)
      if (next) {
        attachLocalPreview(room)
        appliedOrientationRef.current = videoOrientation
        failedAutoOrientationRef.current = null
        setPublishedOrientation(videoOrientation)
        setPrivacyPaused(false)
        setCameraRecoveryNeeded(false)
      }
    } catch {
      setError(next ? 'カメラを再開できませんでした。カメラ権限を確認してください。' : 'カメラを停止できませんでした。')
    } finally {
      setMediaBusy(false)
    }
  }

  const retryCamera = async () => {
    const room = roomRef.current
    if (!room || mediaBusy) return
    setMediaBusy(true)
    setError(null)
    try {
      await setHostCameraEnabled(room, false, cameraFacing, videoOrientation)
      await setHostCameraEnabled(room, true, cameraFacing, videoOrientation)
      attachLocalPreview(room)
      appliedOrientationRef.current = videoOrientation
      failedAutoOrientationRef.current = null
      setPublishedOrientation(videoOrientation)
      setCameraEnabled(true)
      setCameraRecoveryNeeded(false)
    } catch {
      setCameraEnabled(false)
      setError('カメラを復旧できませんでした。権限を確認して、もう一度再試行してください。音声とLIVE接続は維持しています。')
    } finally {
      setMediaBusy(false)
    }
  }

  const selectOrientation = async (nextMode: LiveOrientationMode) => {
    if (nextMode === orientationMode || busy || mediaBusy || switchingCamera || orientationSwitchRef.current) return
    const previousMode = orientationMode
    const previousOrientation = videoOrientation
    const nextOrientation = resolveLiveOrientation(nextMode, deviceOrient)
    const room = roomRef.current
    orientationSwitchRef.current = true
    setMediaBusy(true)
    setError(null)
    try {
      if (room && cameraEnabled && nextOrientation !== previousOrientation) {
        const restarted = await restartHostCameraForOrientation(room, cameraFacing, nextOrientation)
        if (!restarted) throw new Error('camera_track_unavailable')
        attachLocalPreview(room)
      }
      appliedOrientationRef.current = nextOrientation
      setPublishedOrientation(nextOrientation)
      failedAutoOrientationRef.current = null
      setOrientationMode(nextMode)
      writeLiveOrientationMode(liveOrientationStorage(), nextMode)
    } catch {
      // Keep the selected mode and the published frame aligned after a failed restart.
      if (room && cameraEnabled) {
        try {
          const restored = await restartHostCameraForOrientation(room, cameraFacing, previousOrientation)
          if (!restored) throw new Error('camera_track_unavailable')
          attachLocalPreview(room)
          setError('配信方向を切り替えられませんでした。元の向きで配信を継続しています。')
        } catch {
          setCameraRecoveryNeeded(true)
          setError('映像の復旧確認が必要です。音声とLIVE接続は維持しています。「カメラを再試行」を押してください。')
        }
      } else {
        setError('配信方向を切り替えられませんでした。もう一度お試しください。')
      }
      setOrientationMode(previousMode)
    } finally {
      orientationSwitchRef.current = false
      setMediaBusy(false)
    }
  }

  const orientationPicker = (compact = false) => (
    <fieldset className={`pl-live__orientation-picker${compact ? ' pl-live__orientation-picker--compact' : ''}`}>
      <legend>配信方向</legend>
      <div role="group" aria-label="配信方向を選択">
        {([
          ['portrait', '縦型', '9:16'],
          ['landscape', '横型', '16:9'],
          ['auto', '自動', '端末に追従'],
        ] as const).map(([value, label, detail]) => (
          <button key={value} type="button" aria-pressed={orientationMode === value}
            data-selected={orientationMode === value} disabled={busy || mediaBusy || switchingCamera}
            onClick={() => void selectOrientation(value)}>
            <strong>{label}</strong><small>{detail}</small>
          </button>
        ))}
      </div>
      {!compact ? <p>初回は縦型です。自動は端末を回転したときだけ映像の向きを切り替えます。</p> : null}
    </fieldset>
  )

  const sendComment = async () => {
    if (!draft.trim() || !liveSessionId) return
    try {
      await postLiveComment({
        performerId: performer.id,
        userId: profile.id,
        displayName: profile.display_name || performer.stage_name,
        body: draft,
        liveSessionId,
      })
      setDraft('')
    } catch (e) {
      setError('コメントを送信できませんでした。通信を確認して、もう一度お試しください。')
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
    if (!liveSessionId || comment.user_id === profile.id) return
    try {
      await muteLiveCommentUser({ liveSessionId, userId: comment.user_id, mutedBy: profile.id })
      await deleteLiveComment(comment.id)
      setComments((prev) => removeLiveComment(prev, comment.id))
    } catch {
      setError('このLIVEでユーザーをミュートできませんでした。権限と通信を確認してください。')
    }
  }

  if (phase === 'ready' && method === 'youtube') {
    return <YouTubeLiveSetup performer={performer} onBack={onBack} onChooseDirect={() => setMethod('direct')} onPreview={onPreviewYouTube} onSaved={refreshProfile} />
  }

  return (
    <div
      className={`pl-live pl-live--performer${phase === 'live' && isOverlayChrome ? ' pl-live--immersive' : ''}`}
      data-layout={mode}
      data-phase={phase}
      data-video-orientation={displayOrientation}
      style={{
        '--video-aspect': String(displayOrientation === 'portrait' ? 9 / 16 : 16 / 9),
        '--video-fit': 'contain',
      } as CSSProperties}
    >
      <div className="pl-live__stage">
        <video ref={videoRef} className="pl-live__video" style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }} playsInline muted autoPlay />
        {phase === 'live' && !cameraEnabled ? (
          <div className="pl-live__media-paused" role="status">
            <VideoOff aria-hidden="true" size={30} />
            <strong>{microphoneEnabled ? '音声のみで配信中' : 'カメラ・マイク停止中'}</strong>
            <span>{privacyPaused ? 'プライバシー保護のため停止しました' : 'LIVEルームの接続は維持しています'}</span>
          </div>
        ) : null}
        {phase === 'live' && performer ? (
          <TipGiftOverlay performerId={performer.id} soundEnabled={soundOn} reducedMotion={calmMotion} onGift={fever.addGift} />
        ) : null}
        {phase === 'live' ? <LiveFeverOverlay level={fever.level} likes={fever.likes} hearts={fever.hearts} reducedMotion={calmMotion} /> : null}
        {phase === 'ready' && previewState !== 'ready' ? <div className="pl-live__placeholder">{previewState === 'preparing' ? 'カメラ・マイクの許可を待っています…' : previewState === 'denied' ? 'カメラ・マイクを許可してください' : previewState === 'ended' ? 'LIVE配信を終了しました' : 'ここにカメラ映像が表示されます'}</div> : null}
        <div className="pl-live__hud-top">
          <button type="button" className="pl-btn pl-btn--ghost pl-live__chip" onClick={onBack}>
            戻る
          </button>
          {phase === 'live' ? (
            <div className="pl-live__stats">
              <span className="pl-live__pill">LIVE中</span>
              <span>{formatDuration(elapsed)}</span>
              <span>👁 {viewers}</span>
              <span>{displayOrientation === 'landscape' ? '横型 16:9' : '縦型 9:16'}で配信中</span>
            </div>
          ) : null}
        </div>
        {phase === 'live' ? (
          <div className="pl-live__media-controls" aria-label="配信メディア操作">
            <button
              type="button"
              className="pl-live__media-control pl-live__camera-switch"
              data-camera-facing={cameraFacing}
              data-switch-available={cameraSwitchAvailable}
              aria-label={`カメラ切替（現在：${cameraFacing === 'user' ? '前面' : '背面'}）`}
              title={cameraSwitchAvailable ? '前面・背面カメラを切り替える' : '利用できるカメラが1台のみです'}
              disabled={!roomRef.current || !cameraEnabled || busy || mediaBusy || switchingCamera || !cameraSwitchAvailable}
              onClick={() => void switchCamera()}
            >
              <SwitchCamera aria-hidden="true" size={22} />
              <span>{switchingCamera ? '切替中' : '切替'}</span>
            </button>
            <button
              type="button"
              className="pl-live__media-control"
              data-active={microphoneEnabled}
              aria-label={microphoneEnabled ? 'マイクを停止' : 'マイクを再開'}
              disabled={!roomRef.current || mediaBusy}
              onClick={() => void toggleMicrophone()}
            >
              {microphoneEnabled ? <Mic aria-hidden="true" size={22} /> : <MicOff aria-hidden="true" size={22} />}
              <span>{microphoneEnabled ? 'マイク' : '再開'}</span>
            </button>
            <button
              type="button"
              className="pl-live__media-control"
              data-active={cameraEnabled}
              aria-label={cameraEnabled ? 'カメラを停止' : 'カメラを再開'}
              disabled={!roomRef.current || mediaBusy || switchingCamera}
              onClick={() => void toggleCamera()}
            >
              {cameraEnabled ? <Video aria-hidden="true" size={22} /> : <VideoOff aria-hidden="true" size={22} />}
              <span>{cameraEnabled ? 'カメラ' : '再開'}</span>
            </button>
          </div>
        ) : null}
      </div>

      {phase === 'ready' ? (
        <div className="pl-live__panel">
          <div className="pl-live-methods" role="radiogroup" aria-label="配信方法">
            <button type="button" role="radio" aria-checked="true" data-selected="true">
              <Video aria-hidden="true" /><span><strong>HAKU DIRECT LIVE</strong><small>HAKUのカメラ・マイクで直接配信</small></span>
            </button>
            <button type="button" role="radio" aria-checked="false" onClick={() => setMethod('youtube')}>
              <span aria-hidden="true">▶</span><span><strong>YouTube LIVE連携</strong><small>YouTubeのURLを貼ってHAKUで公開</small></span>
            </button>
          </div>
          <p className="pl-brand">LIVE FOR YOUR FANS</p><h1 className="pl-h1">会場に来られないファンにも届けよう</h1>
          <p className="pl-muted">視聴は無料です。配信中はオンラインのファンからも応援を受け取れます。</p>
          {orientationPicker()}
          <ol className="pl-live__setup-steps"><li data-done={previewState === 'ready'}>1. カメラ・マイクを許可</li><li data-done={previewState === 'ready'}>2. 映像と音声を確認</li><li>3. LIVE配信を開始</li></ol>
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
          {scheduleFeatureAvailable ? <div className="pl-card" aria-label="LIVE予約">
            <strong>LIVEを予約</strong>
            <p className="pl-muted">タイトルと開始予定を公開し、ファンが開始通知を予約できます。</p>
            <input className="pl-input" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
            <button type="button" className="pl-btn pl-btn--ghost" disabled={busy || !title.trim() || !scheduleAt} onClick={() => void scheduleLive()}>この内容で予約を公開</button>
            {schedules.slice(0, 3).map((schedule) => <p key={schedule.id} className="pl-muted">{new Date(schedule.scheduled_start_at).toLocaleString('ja-JP')} · {schedule.title}</p>)}
          </div> : null}
          <label className="pl-live__location-consent">
            <input
              type="checkbox"
              checked={shareLocation}
              onChange={(event) => setShareLocation(event.target.checked)}
            />
            <span><strong>現在地を共有してMAPに表示</strong><small>LIVE中だけ現在地を更新します。いつでもOFFにできます。</small></span>
          </label>
          {previewState !== 'ready' ? <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void preparePreview()}>{busy ? 'カメラを準備中…' : 'カメラ・マイクを準備する'}</button> : <p className="pl-registration__notice" role="status">映像の準備ができました。画面を確認してから配信を開始してください。</p>}
          <button type="button" className="pl-btn pl-btn--block pl-btn--live" disabled={busy || previewState !== 'ready'} onClick={() => void goLive()}>
            {busy ? 'LIVE開始処理中…' : 'LIVE配信を開始'}
          </button>
        </div>
      ) : (
        <div className="pl-live__panel pl-live__panel--live">
          {!roomRef.current && busy ? <p className="pl-muted">カメラ再接続中…</p> : null}
          {orientationPicker(true)}
          <div className="pl-live__comments-wrap">
            <div ref={commentScroll.listRef} className="pl-live__comments" onScroll={commentScroll.onScroll} aria-live="polite">
              {comments.map((c) => (
                <div key={c.id} className="pl-live__comment">
                  <span><strong>{c.display_name}</strong> {c.body}</span>
                  {canModerate ? <span className="pl-live__comment-actions">
                    {c.user_id !== profile.id ? <button type="button" onClick={() => void muteCommenter(c)} aria-label={`${c.display_name}をこのLIVEでミュート`} title="このLIVEでミュート"><UserX size={14} /></button> : null}
                    <button type="button" onClick={() => void removeComment(c.id)} aria-label={`${c.display_name}のコメントを削除`} title="コメントを削除"><Trash2 size={14} /></button>
                  </span> : null}
                </div>
              ))}
            </div>
            {commentScroll.hasNewComments ? <button type="button" className="pl-live__latest-comments" onClick={() => commentScroll.scrollToLatest()}><ArrowDown size={14} /> 最新コメント</button> : null}
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
              送信
            </button>
          </div>
          <div className="pl-live__prefs">
            <label>
              <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} />
              MAP位置共有
            </label>
            <label>
              <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
              ギフト音
            </label>
            <label>
              <input type="checkbox" checked={calmMotion} onChange={(e) => setCalmMotion(e.target.checked)} />
              演出を抑える
            </label>
          </div>
          <button type="button" className="pl-btn pl-btn--block pl-btn--danger pl-live__end-live" disabled={busy || mediaBusy || switchingCamera} onClick={() => void stopLive()}>
            ライブ終了
          </button>
        </div>
      )}
      {error ? <p className="pl-error">{error}</p> : null}
      {cameraRecoveryNeeded ? (
        <button type="button" className="pl-btn pl-btn--block" disabled={mediaBusy} onClick={() => void retryCamera()}>
          {mediaBusy ? 'カメラ再試行中…' : 'カメラを再試行'}
        </button>
      ) : null}
    </div>
  )
}
