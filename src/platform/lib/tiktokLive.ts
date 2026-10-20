const TIKTOK_HANDLE = /^[A-Za-z0-9._]{2,24}$/

export const TIKTOK_LIVE_QUERY = 'tiktokLive'

export type TikTokLiveEntry = {
  handle: string
  performerId: string | null
  url: string
}

export function parseTikTokLiveEntry(search: string): TikTokLiveEntry | null {
  const params = new URLSearchParams(search)
  const rawHandle = params.get(TIKTOK_LIVE_QUERY)?.replace(/^@/, '').trim() ?? ''
  if (!TIKTOK_HANDLE.test(rawHandle)) return null

  const performerId = params.get('performerId')?.trim() || null
  return {
    handle: rawHandle,
    performerId,
    url: `https://www.tiktok.com/@${rawHandle}/live`,
  }
}

