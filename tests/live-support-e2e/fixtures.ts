export const getPerformer = async () => ({ id: 'fixture', stage_name: 'Safari LIVE', is_live: true, is_approved: true, live_started_at: new Date().toISOString() })
export const useAuth = () => ({ user: new URLSearchParams(location.search).has('signedIn') ? { id: 'fan-fixture' } : null, profile: null })
export const supabaseAuthHeaders = async () => new URLSearchParams(location.search).has('signedIn') ? { Authorization: 'Bearer fixture-only' } : {}
export const trackProductEvent = () => {}
export const useTrackView = () => {}
export const getActiveLiveSessionId = async () => 'session-fixture'
export const listLiveComments = async () => Array.from({ length: 8 }, (_, i) => ({ id: String(i), display_name: 'Fan', body: `Hello LIVE ${i}` }))
export const listRecentLiveTipEvents = async () => []
export const isFollowing = async () => false
export const canModerateLiveComments = async () => false
export const subscribePerformerLive = () => () => {}
export const subscribeLiveComments = () => () => {}
export const subscribeLiveTipEvents = () => () => {}
export const subscribeLiveFever = () => ({ unsubscribe() {}, publish() {} })
export const deleteLiveComment = async () => {}
export const muteLiveCommentUser = async () => {}
export const postLiveComment = async () => {}
export const follow = async () => {}
export const unfollow = async () => {}
export const updateLiveViewerPeak = async () => {}
export const supabase = null
export const isSupabaseConfigured = false
export const requireSupabase = () => { throw new Error('Network DB disabled') }
// Isolated media adapter: keep the normal connected layout without external media.
export const fetchLiveKitStatus = async () => ({ configured: true })
export const fetchLiveKitToken = async () => ({ token: 'offline', url: 'offline' })
export const connectAsViewer = async () => ({ localParticipant: { connectionQuality: 'excellent' }, on() {}, async disconnect() {} })
export const countViewers = () => 2
export const applyNetworkAdaptation = () => 'AUTO'
export const watchRemoteMedia = () => {}
export const attachRemoteTrack = () => {}
export const preferAudioOnly = () => {}
export class LiveKitClientError extends Error {}
export const liveKitErrorMessage = () => 'Offline media fixture'
