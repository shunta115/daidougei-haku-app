import type { Performer } from '../types'
import type { StreamPresenceStatus } from '../types'
import { enableMockStreams, isPublicMode } from '../config/runtimeConfig'
import { isValidHttpUrl } from './productionGuard'

export type { StreamPresenceStatus }

export function getStreamPresenceStatus(p: Performer | undefined): StreamPresenceStatus {
  if (!p) return 'offline'
  if (p.approvalStatus !== 'approved' || !p.canStream) return 'offline'
  const hasUrl = isValidHttpUrl(p.streamUrl)
  if (p.isLive) {
    if (hasUrl || enableMockStreams) return 'live'
    return 'preparing'
  }
  if (hasUrl) return 'upcoming'
  if (p.streamTitle) return 'preparing'
  return 'offline'
}

/** 公開モードで LIVE バッジ・ライブ一覧に載せてよいか */
export function shouldShowAsLiveStream(p: Performer): boolean {
  return getStreamPresenceStatus(p) === 'live'
}

const PICSUM_HOST = 'picsum.photos'

export function isDemoPlaceholderPhoto(url: string | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname.includes(PICSUM_HOST)
  } catch {
    return false
  }
}

/**
 * 表示用 photoUrl。公開モードでは picsum 等のデモ画像を使わない。
 * 未設定時は undefined → UI は initials / gradient にフォールバック。
 */
export function resolvePerformerPhotoUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined
  if (isPublicMode && isDemoPlaceholderPhoto(url)) return undefined
  if (!isValidHttpUrl(url)) return undefined
  return url
}
