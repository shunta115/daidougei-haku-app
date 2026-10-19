import { createClient, type User } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { EgressClient } from 'livekit-server-sdk'
import { EgressStatus, StreamOutput, StreamProtocol, type EgressInfo } from '@livekit/protocol'
import { getLiveKitConfig, roomNameForPerformer } from '../livekit/_shared.js'
import { createOAuthState, decryptSecret, encryptSecret, parseOAuthState, safeDestination, validateYouTubeStreamKey, type DestinationRow } from './_security.js'
export { createOAuthState, decryptSecret, encryptSecret, parseOAuthState, safeDestination, validateYouTubeStreamKey, type DestinationRow } from './_security.js'

type OAuthSecret = { accessToken: string; refreshToken?: string; expiresAt: number; scope: string }

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, '') || ''
}

function supabaseConfig() {
  const url = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const anon = cleanEnv(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  const service = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !anon || !service) throw new Error('Supabase server credentials missing')
  return { url, anon, service }
}

export function adminSupabase() {
  const { url, service } = supabaseConfig()
  return createClient(url, service, { auth: { persistSession: false } })
}

export async function requirePerformer(req: VercelRequest, res: VercelResponse): Promise<User | null> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization required' })
    return null
  }
  const { url, anon } = supabaseConfig()
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  const admin = adminSupabase()
  const [{ data: performer }, { data: profile }] = await Promise.all([
    admin.from('performers').select('id,is_approved').eq('id', data.user.id).maybeSingle(),
    admin.from('profiles').select('status').eq('id', data.user.id).maybeSingle(),
  ])
  if (!performer?.is_approved || profile?.status !== 'active') {
    res.status(403).json({ error: 'Approved performer required' })
    return null
  }
  return data.user
}

export async function getDestination(performerId: string) {
  const { data, error } = await adminSupabase()
    .from('multi_live_destinations')
    .select('*')
    .eq('performer_id', performerId)
    .eq('provider', 'youtube')
    .maybeSingle()
  if (error) throw error
  return data as DestinationRow | null
}

export async function updateRuntimeState(performerId: string, values: Partial<Pick<DestinationRow, 'egress_id' | 'status' | 'last_error_code'>>) {
  const { error } = await adminSupabase().from('multi_live_destinations').update(values).eq('performer_id', performerId).eq('provider', 'youtube')
  if (error) throw error
}

export function egressClient() {
  const { url, apiKey, apiSecret } = getLiveKitConfig()
  return new EgressClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret)
}

export async function startYouTubeEgress(row: DestinationRow) {
  const { streamKey } = decryptSecret<{ streamKey: string }>(row.encrypted_ingest)
  if (!validateYouTubeStreamKey(streamKey)) throw new Error('INVALID_STREAM_KEY')
  const url = `rtmps://a.rtmps.youtube.com/live2/${streamKey}`
  return egressClient().startRoomCompositeEgress(
    roomNameForPerformer(row.performer_id),
    new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [url] }),
    { layout: 'speaker' },
  )
}

export function publicErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'INVALID_STREAM_KEY') return 'invalid_stream_key'
  if (/not.?found|room/i.test(message)) return 'room_not_ready'
  if (/quota|limit|resource.?exhausted/i.test(message)) return 'egress_quota'
  if (/auth|permission|unauth/i.test(message)) return 'egress_auth'
  return 'egress_failed'
}

export function runtimeStateFromEgress(info: EgressInfo) {
  switch (info.status) {
    case EgressStatus.EGRESS_STARTING:
      return { status: 'starting' as const, egress_id: info.egressId, last_error_code: null }
    case EgressStatus.EGRESS_ACTIVE:
      return { status: 'live' as const, egress_id: info.egressId, last_error_code: null }
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return { status: 'failed' as const, egress_id: null, last_error_code: info.status === EgressStatus.EGRESS_LIMIT_REACHED ? 'egress_quota' : 'egress_failed' }
    default:
      return { status: 'stopped' as const, egress_id: null, last_error_code: null }
  }
}

function oauthClientConfig() {
  const clientId = cleanEnv(process.env.YOUTUBE_OAUTH_CLIENT_ID)
  const clientSecret = cleanEnv(process.env.YOUTUBE_OAUTH_CLIENT_SECRET)
  const redirectUri = cleanEnv(process.env.YOUTUBE_OAUTH_REDIRECT_URI)
  if (!clientId || !clientSecret || !redirectUri) throw new Error('YouTube OAuth is not configured')
  return { clientId, clientSecret, redirectUri }
}

export function youtubeAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = oauthClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeOAuthCode(code: string): Promise<OAuthSecret> {
  const { clientId, clientSecret, redirectUri } = oauthClientConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  const json = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }
  if (!response.ok || !json.access_token) throw new Error(`OAuth exchange failed: ${json.error || response.status}`)
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000, scope: json.scope || '' }
}

export async function youtubeAccessToken(row: DestinationRow) {
  if (!row.encrypted_oauth) throw new Error('YouTube OAuth is not connected')
  const secret = decryptSecret<OAuthSecret>(row.encrypted_oauth)
  if (secret.expiresAt > Date.now() + 60_000) return secret.accessToken
  if (!secret.refreshToken) throw new Error('YouTube OAuth refresh token missing')
  const { clientId, clientSecret } = oauthClientConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }),
  })
  const json = await response.json() as { access_token?: string; expires_in?: number; scope?: string; error?: string }
  if (!response.ok || !json.access_token) throw new Error(`OAuth refresh failed: ${json.error || response.status}`)
  const next: OAuthSecret = { ...secret, accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000, scope: json.scope || secret.scope }
  const { error } = await adminSupabase().from('multi_live_destinations').update({ encrypted_oauth: encryptSecret(next) }).eq('performer_id', row.performer_id).eq('provider', 'youtube')
  if (error) throw error
  return next.accessToken
}

export async function youtubeApi<T>(row: DestinationRow, path: string, init?: RequestInit): Promise<T> {
  const token = await youtubeAccessToken(row)
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  const json = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(json.error?.message || `YouTube API ${response.status}`)
  return json
}

export async function activeYouTubeChat(row: DestinationRow) {
  const data = await youtubeApi<{ items?: Array<{ snippet?: { liveChatId?: string }; id?: string }> }>(row, 'liveBroadcasts?part=id,snippet&broadcastStatus=active&mine=true&maxResults=5')
  const item = data.items?.find((candidate) => candidate.snippet?.liveChatId)
  if (!item?.snippet?.liveChatId) throw new Error('No active YouTube live chat')
  return { liveChatId: item.snippet.liveChatId, broadcastId: item.id }
}
