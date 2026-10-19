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
