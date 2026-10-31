import { requireSupabase } from './supabase'
import { parseYouTubeLiveReference } from './youtubeLive'

export type YouTubeLiveSettings = {
  youtube_live_video_id: string | null
  youtube_live_url: string | null
  youtube_live_enabled: boolean
}

type Failure = 'authentication' | 'permission' | 'database' | 'network' | 'invalid'
export class YouTubeLivePublishError extends Error {
  constructor(public readonly kind: Failure, public readonly code?: string) {
    super(kind)
  }
}

// Never surface database messages/details: they can contain row data.
export function youtubeLivePublishError(error: unknown): string {
  const failure = error instanceof YouTubeLivePublishError ? error : classify(error)
  if (failure.kind === 'authentication') return 'ログインの有効期限が切れています。HAKUにログインし直して、もう一度お試しください。'
  if (failure.kind === 'permission') return 'このパフォーマーの公開設定を変更する権限がありません。本人のHAKUアカウントと登録状況を確認してください。'
  if (failure.kind === 'network') return '通信できませんでした。通信状態を確認して、もう一度お試しください。'
  if (failure.kind === 'invalid') return 'YouTube LIVEのURLを確認して、もう一度貼り付けてください。'
  return `公開設定をデータベースに保存できませんでした。時間をおいて再試行し、続く場合は運営にお問い合わせください。${failure.code ? `（コード：${failure.code}）` : ''}`
}

function classify(error: unknown): YouTubeLivePublishError {
  if (error instanceof YouTubeLivePublishError) return error
  const value = error as { code?: unknown; status?: number; message?: unknown; name?: string } | null
  const code = typeof value?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(value.code) ? value.code : undefined
  if (value?.status === 401 || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') return new YouTubeLivePublishError('authentication', code)
  if (value?.status === 403 || code === '42501') return new YouTubeLivePublishError('permission', code)
  if (value?.status === 0 || value?.name === 'AbortError' || value?.name === 'AuthRetryableFetchError' || /failed to fetch|fetch failed|network|load failed|timeout/i.test(String(value?.message ?? ''))) return new YouTubeLivePublishError('network')
  return new YouTubeLivePublishError('database', code)
}

export async function saveYouTubeLiveSettings(performerId: string, patch: Partial<YouTubeLiveSettings>): Promise<YouTubeLiveSettings> {
  const sb = requireSupabase()
  try {
    // getUser validates/refreshes the HAKU session; never trust a performer ID supplied by the UI.
    const { data: identity, error: authError } = await sb.auth.getUser()
    if (authError) {
      const failure = classify(authError)
      throw failure.kind === 'network' ? failure : new YouTubeLivePublishError('authentication')
    }
    if (!identity.user) throw new YouTubeLivePublishError('authentication')
    if (identity.user.id !== performerId) throw new YouTubeLivePublishError('permission')
    const { data: profile, error: profileError } = await sb.from('profiles').select('id, status').eq('id', identity.user.id).maybeSingle()
    if (profileError) throw classify(profileError)
    if (!profile || profile.status !== 'active') throw new YouTubeLivePublishError('permission')
    // Explicit allowlist prevents callers from modifying other performer fields.
    const settings: Partial<YouTubeLiveSettings> = {}
    if ('youtube_live_enabled' in patch) settings.youtube_live_enabled = patch.youtube_live_enabled
    if ('youtube_live_url' in patch || 'youtube_live_video_id' in patch) {
      if (patch.youtube_live_url === null && patch.youtube_live_video_id === null && patch.youtube_live_enabled === false) {
        settings.youtube_live_url = null
        settings.youtube_live_video_id = null
      } else {
        const reference = parseYouTubeLiveReference(patch.youtube_live_url ?? '')
        if (!reference || reference.videoId !== patch.youtube_live_video_id) throw new YouTubeLivePublishError('invalid')
        settings.youtube_live_url = reference.canonicalUrl
        settings.youtube_live_video_id = reference.videoId
      }
    }
    const { data, error } = await sb.from('performers').update(settings).eq('id', identity.user.id)
      .select('youtube_live_video_id, youtube_live_url, youtube_live_enabled').maybeSingle()
    if (error) throw classify(error)
    if (!data) throw new YouTubeLivePublishError('permission')
    return data as YouTubeLiveSettings
  } catch (error) {
    throw classify(error)
  }
}
