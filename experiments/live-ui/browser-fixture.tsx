import { useState } from 'react'

const query = new URLSearchParams(location.search)
const commentCount = Math.min(1000, Math.max(0, Number(query.get('comments') || 0)))
const performer = { id: 'qa-performer', stage_name: 'Test Performer', is_live: query.get('phase') !== 'ready', is_approved: true, live_started_at: new Date(Date.now() - 27_000).toISOString(), live_title: 'LOCAL UI FIXTURE', genre: 'パフォーマンス', photo_url: null, share_location: false, youtube_live_enabled: false }
const profile = { id: 'qa-user', display_name: 'QA Viewer', role: 'performer' }
const performerListeners = new Set<(row: unknown) => void>()
const commentListeners = new Set<{ onInsert: (row: unknown) => void; onDelete: (id: string) => void }>()
const noop = () => undefined
const refreshProfile = async () => undefined
const qa = { connects: 0, disconnects: 0, follows: 0, end: () => endLive(), comments: commentCount }
Object.assign(window, { __hakuLiveQa: qa })

export const useAuth = () => ({ user: { id: profile.id }, profile, performer, refreshProfile })
export const supabase = null
export const isSupabaseConfigured = false
export const supabaseAuthHeaders = async () => ({})
export const requireSupabase = () => { throw new Error('Production APIs are unavailable in the UI QA fixture') }
export const trackProductEvent = noop
export const useTrackView = noop
export const getPerformer = async () => performer
export const getActiveLiveSessionId = async () => 'qa-session'
export const listLiveComments = async () => Array.from({ length: commentCount }, (_, index) => ({ id: `qa-comment-${index}`, user_id: `qa-viewer-${index}`, display_name: `Fan ${index + 1}`, body: '素晴らしいパフォーマンス！👏', performer_id: performer.id, live_session_id: 'qa-session', created_at: new Date().toISOString() }))
export const subscribeLiveComments = (_performer: string, _session: string, listener: { onInsert: (row: unknown) => void; onDelete: (id: string) => void }) => { commentListeners.add(listener); return () => commentListeners.delete(listener) }
export const subscribePerformerLive = (_id: string, listener: (row: unknown) => void) => { performerListeners.add(listener); return () => performerListeners.delete(listener) }
export const postLiveComment = async (input: { body: string; displayName: string }) => { const row = { id: `qa-new-${Date.now()}`, display_name: input.displayName, body: input.body, user_id: profile.id }; commentListeners.forEach((listener) => listener.onInsert(row)) }
export const deleteLiveComment = async (id: string) => { commentListeners.forEach((listener) => listener.onDelete(id)) }
export const muteLiveCommentUser = async () => undefined
export const canModerateLiveComments = async () => true
export const isFollowing = async () => false
export const follow = async () => { qa.follows += 1 }
export const unfollow = async () => { qa.follows -= 1 }
export const updateLiveViewerPeak = async () => undefined
export const updatePerformer = async () => undefined
export const startLive = async () => { performer.is_live = true; return 'qa-session' }
export const endLive = async () => { performer.is_live = false; performerListeners.forEach((listener) => listener({ is_live: false })) }
export const listPerformerLiveSchedules = async () => []
export const createLiveSchedule = async () => ({ id: 'qa-schedule' })
export const notifyLiveReservationStarted = async () => undefined
export const liveReservationsEnabled = false
export const listRecentLiveTipEvents = async () => []
export const subscribeLiveTipEvents = () => noop
export const useLiveFever = () => { const [likes, setLikes] = useState(123); return { level: 64, likes, hearts: [], sendLike: () => setLikes((value) => value + 1), addGift: noop } }

let sourceStream: MediaStream | undefined
let canvas: HTMLCanvasElement | undefined
let animation: number | undefined
let facing = 'user'
function source() {
  if (sourceStream) return sourceStream
  canvas = document.createElement('canvas')
  canvas.width = query.get('orientation') === 'landscape' ? 1280 : 720
  canvas.height = query.get('orientation') === 'landscape' ? 720 : 1280
  const context = canvas.getContext('2d')!
  const draw = () => {
    if (!canvas) return
    const w = canvas.width, h = canvas.height
    const gradient = context.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#142a4a'); gradient.addColorStop(1, '#145c58')
    context.fillStyle = gradient; context.fillRect(0, 0, w, h)
    context.fillStyle = '#22dccc'; context.fillRect(30 + (Date.now() / 25) % Math.max(1, w - 140), h * .3, 110, 110)
    context.fillStyle = '#fff'; context.font = `${Math.round(w / 15)}px sans-serif`; context.textAlign = 'center'
    context.fillText('HAKU TEST PATTERN', w / 2, h * .52)
    context.font = `${Math.round(w / 24)}px sans-serif`; context.fillText('Synthetic frames · no camera', w / 2, h * .58)
    animation = requestAnimationFrame(draw)
  }
  draw()
  sourceStream = canvas.captureStream(15)
  return sourceStream
}
const cameraTrack = {
  isMuted: false,
  get mediaStreamTrack() { return source().getVideoTracks()[0] },
  getSourceTrackSettings: () => ({ width: canvas?.width || 720, height: canvas?.height || 1280, facingMode: facing, frameRate: 15 }),
  getProcessor: () => undefined,
  getSenderStats: async () => [{ frameWidth: canvas?.width || 720, frameHeight: canvas?.height || 1280, framesPerSecond: 15, targetBitrate: 1_000_000, qualityLimitationReason: 'none', rid: 'qa', timestamp: performance.now(), bytesSent: performance.now() * 125 }],
  attach(video: HTMLVideoElement) { video.srcObject = source(); void video.play().catch(noop); return video },
}
const publication = { kind: 'video', track: cameraTrack }
function room() {
  qa.connects += 1
  source()
  return {
    state: 'connected', remoteParticipants: new Map(),
    localParticipant: { connectionQuality: 'good', trackPublications: new Map([['video', publication]]), videoTrackPublications: new Map([['video', publication]]), getTrackPublication: () => publication },
    on() { return this },
    async disconnect() { qa.disconnects += 1; sourceStream?.getTracks().forEach((track) => track.stop()); sourceStream = undefined; if (animation) cancelAnimationFrame(animation) },
  }
}
export class LiveKitClientError extends Error {}
export const fetchLiveKitStatus = async () => ({ configured: true })
export const fetchLiveKitToken = async () => ({ token: 'local-fixture', url: 'wss://invalid.localhost', room: 'local-fixture' })
export const connectAsViewer = async () => room()
export const connectAsHost = async () => room()
export const countViewers = () => 162
export const applyNetworkAdaptation = () => 'AUTO'
export const preferAudioOnly = noop
export const liveKitErrorMessage = () => 'LOCAL FIXTURE ERROR'
export const liveMediaDeviceErrorMessage = liveKitErrorMessage
export const watchRemoteMedia = (_room: unknown, callback: (track: unknown) => void) => { callback(cameraTrack); return noop }
export const attachRemoteTrack = (_track: unknown, video: HTMLVideoElement | null) => { if (video) cameraTrack.attach(video) }
export const hostCameraTrack = () => cameraTrack
export const canSwitchHostCamera = async () => true
export const switchHostCamera = async () => { facing = facing === 'user' ? 'environment' : 'user'; return facing }
export const restartHostCameraForOrientation = async () => true
export const setHostMicrophoneEnabled = async (_room: unknown, enabled: boolean) => enabled
export const setHostCameraEnabled = async (_room: unknown, enabled: boolean) => enabled
export const reserveLive = async () => 'qa-session'
