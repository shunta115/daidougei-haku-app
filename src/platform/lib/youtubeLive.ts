const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export type YouTubeLiveReference = {
  videoId: string
  canonicalUrl: string
}

export function parseYouTubeLiveReference(value: string): YouTubeLiveReference | null {
  const input = value.trim()
  if (VIDEO_ID.test(input)) return { videoId: input, canonicalUrl: `https://www.youtube.com/watch?v=${input}` }

  let url: URL
  try { url = new URL(input) } catch { return null }
  if (url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let videoId = ''
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v') ?? ''
    else {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts[0] === 'live' || parts[0] === 'embed') videoId = parts[1] ?? ''
    }
  }
  return VIDEO_ID.test(videoId) ? { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` } : null
}

export function youtubeEmbedUrl(videoId: string, origin: string): string {
  const query = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    enablejsapi: '1',
    origin,
    rel: '0',
  })
  return `https://www.youtube-nocookie.com/embed/${videoId}?${query.toString()}`
}

export function youtubePlayerErrorMessage(code: number): string {
  if (code === 101 || code === 150) return 'この配信はYouTube側で埋め込みが許可されていません。YouTube公式画面で視聴できます。'
  if (code === 100) return 'この配信は終了・非公開・削除済みの可能性があります。YouTube公式画面で状態をご確認ください。'
  if (code === 2) return '登録されたYouTube LIVE URLが正しくありません。パフォーマーにURLの再登録を依頼してください。'
  return 'YouTubeプレーヤーで再生できませんでした。YouTube公式画面で視聴できます。'
}
