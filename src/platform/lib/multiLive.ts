/** Multi LIVE capability model. This module does not start a broadcast. */
export type MultiLiveProvider = 'haku' | 'youtube' | 'tiktok' | 'custom'
export type MultiLiveFeature = 'video' | 'readComments' | 'writeComments' | 'readGifts' | 'readLikes'

export type ProviderCapability = {
  provider: MultiLiveProvider
  video: 'native' | 'rtmp' | 'conditional'
  comments: 'native' | 'oauth' | 'conditional'
  gifts: 'native' | 'oauth' | 'conditional'
  likes: 'native' | 'conditional'
  note: string
}

export const MULTI_LIVE_CAPABILITIES: readonly ProviderCapability[] = [
  { provider: 'haku', video: 'native', comments: 'native', gifts: 'native', likes: 'native', note: 'Uses existing LiveKit and HAKU backend.' },
  { provider: 'youtube', video: 'rtmp', comments: 'oauth', gifts: 'oauth', likes: 'conditional', note: 'Requires YouTube live eligibility, encoder credentials and API authorization.' },
  { provider: 'tiktok', video: 'conditional', comments: 'conditional', gifts: 'conditional', likes: 'conditional', note: 'Only enable after verified official LIVE ingest and API permissions.' },
  { provider: 'custom', video: 'conditional', comments: 'conditional', gifts: 'conditional', likes: 'conditional', note: 'RTMP ingest only; interactive APIs vary by provider.' },
] as const

/** Reject malformed destinations and stream-key leaks into app logs. */
export function validateYouTubeIngestUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'rtmps:' &&
      url.hostname === 'a.rtmps.youtube.com' &&
      url.port === '' &&
      /^\/live2\/[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/.test(url.pathname) &&
      !url.search && !url.hash && !url.username && !url.password
  } catch {
    return false
  }
}

/** Never send ingest URLs, OAuth tokens or stream keys to the browser. */
export type SafeDestinationStatus = {
  provider: MultiLiveProvider
  connected: boolean
  status: 'unconfigured' | 'ready' | 'starting' | 'live' | 'failed' | 'stopped'
  lastErrorCode?: string
}

export type MultiLiveDestinationStatus = SafeDestinationStatus & {
  configured: boolean
  oauthConnected: boolean
  displayName?: string
  visibility?: 'public' | 'unlisted' | 'private'
  enabled: boolean
  updatedAt?: string
}

export type YouTubeChatItem = {
  id: string
  source: 'youtube'
  type: string
  displayName: string
  message: string
  publishedAt?: string
  externalRevenue?: {
    kind: 'super_chat' | 'super_sticker'
    amountMicros?: string
    currency?: string
    displayAmount?: string
  }
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { supabaseAuthHeaders } = await import('./supabase')
  const headers = await supabaseAuthHeaders()
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || '同時配信サービスに接続できませんでした。')
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function getMultiLiveDestination() {
  return authJson<MultiLiveDestinationStatus>('/api/multi-live/destination')
}

export function saveYouTubeDestination(input: { streamKey: string; displayName: string; visibility: 'public' | 'unlisted' | 'private'; enabled: boolean }) {
  return authJson<MultiLiveDestinationStatus>('/api/multi-live/destination', { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteYouTubeDestination() {
  return authJson<void>('/api/multi-live/destination', { method: 'DELETE' })
}

export function startMultiLiveEgress() {
  return authJson<MultiLiveDestinationStatus>('/api/multi-live/egress', { method: 'POST' })
}

export function stopMultiLiveEgress() {
  return authJson<MultiLiveDestinationStatus>('/api/multi-live/egress', { method: 'DELETE' })
}

export function getMultiLiveEgressStatus() {
  return authJson<MultiLiveDestinationStatus>('/api/multi-live/egress')
}

export async function beginYouTubeOAuth() {
  const result = await authJson<{ authorizationUrl: string }>('/api/multi-live/youtube-oauth', { method: 'POST' })
  window.location.assign(result.authorizationUrl)
}

export function disconnectYouTubeOAuth() {
  return authJson<void>('/api/multi-live/youtube-oauth', { method: 'DELETE' })
}

export function getYouTubeChat(pageToken?: string) {
  const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''
  return authJson<{ source: 'youtube'; items: YouTubeChatItem[]; nextPageToken?: string; pollingIntervalMillis: number }>(`/api/multi-live/youtube-chat${query}`)
}

export function postYouTubeChat(message: string) {
  return authJson<{ ok: true }>('/api/multi-live/youtube-chat', { method: 'POST', body: JSON.stringify({ message }) })
}
