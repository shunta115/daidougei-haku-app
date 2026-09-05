import type { AppPersona } from '../types'
import type { Performer } from '../types'

import { isDemoMode } from '../config/runtimeConfig'

/** 開発環境のみ true。本番ビルドでは false。 */
export const IS_DEV = import.meta.env.DEV

export const BETA_SUPPORT_MESSAGE = '投げ銭はログイン後に使えます'

export function isValidHttpUrl(url: string | undefined): url is string {
  if (!url?.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Native LiveKit watch path (not an http(s) media URL). */
export function isInAppLivePath(url: string | undefined): boolean {
  if (!url?.trim()) return false
  return url.startsWith('/live')
}

export function canAccessStaffAreas(): boolean {
  return isDemoMode
}

export function canAccessPerformerAreas(): boolean {
  return isDemoMode
}

export function canProcessOnlineSupport(): boolean {
  return isDemoMode
}

export function sanitizePersonaForProduction(persona: AppPersona): AppPersona {
  if (isDemoMode) return persona
  return 'visitor'
}

export function canWatchLiveStream(performer: Performer | undefined): boolean {
  if (!performer) return false
  if (performer.approvalStatus !== 'approved' || !performer.canStream) return false
  return isValidHttpUrl(performer.streamUrl) || isInAppLivePath(performer.streamUrl)
}
