export const getPerformer = async () => ({ id: 'fixture', stage_name: 'Safari LIVE', is_live: !location.search.includes('youtube'), youtube_live_enabled: true, youtube_live_video_id: 'dQw4w9WgXcQ', youtube_live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', is_approved: true, live_started_at: new Date().toISOString() })
const fixtureUser = { id: 'fan-fixture' }
const fixtureProfile = { display_name: 'Fixture Fan' }
export const useAuth = () => ({ user: new URLSearchParams(location.search).has('signedIn') ? fixtureUser : null, profile: fixtureProfile })
export const supabaseAuthHeaders = async () => new URLSearchParams(location.search).has('signedIn') ? { Authorization: 'Bearer fixture-only' } : {}
export const trackProductEvent = () => {}
export const useTrackView = () => {}
export const getActiveLiveSessionId = async () => 'session-fixture'
export const listLiveComments = async () => Array.from({ length: 80 }, (_, i) => ({ id: String(i), display_name: 'Fan', body: `Hello LIVE ${i}` }))
export const listRecentLiveTipEvents = async () => []
let following = false
export const isFollowing = async () => following
export const canModerateLiveComments = async () => false
export const subscribePerformerLive = () => () => {}
export const subscribeLiveComments = () => () => {}
export const subscribeLiveTipEvents = () => () => {}
export const subscribeLiveFever = () => ({ unsubscribe() {}, publish() {} })
export const deleteLiveComment = async () => {}
export const muteLiveCommentUser = async () => {}
export const postLiveComment = async (value: unknown) => { window.dispatchEvent(new CustomEvent('fixture-comment', { detail: value })) }
export const follow = async () => { following = true; window.dispatchEvent(new Event('fixture-follow')) }
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
