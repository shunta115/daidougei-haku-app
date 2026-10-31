import { copyAppearanceUrl, isShareCancellation } from './appearanceShare'
import { PLATFORM_PATH } from '../../app/routes'

export function liveLandingUrl(origin: string, performerId: string, startedAt?: string | null) {
  const url = new URL(PLATFORM_PATH, origin)
  url.searchParams.set('watch', performerId)
  if (startedAt) url.searchParams.set('liveStartedAt', startedAt)
  return url.toString()
}

export async function shareLiveUrl(url: string, title: string) {
  const data = { title, text: 'このLIVEを一緒に見よう。', url }
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try { await navigator.share(data); return 'shared' as const }
    catch (error) { if (isShareCancellation(error)) return 'cancelled' as const }
  }
  await copyAppearanceUrl(url)
  return 'copied' as const
}
