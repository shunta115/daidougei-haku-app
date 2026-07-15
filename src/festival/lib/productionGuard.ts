import type { AppPersona } from '../types'
import type { Performer } from '../types'

/** 開発環境のみ true。本番ビルドでは false。 */
export const IS_DEV = import.meta.env.DEV

export const BETA_SUPPORT_MESSAGE = 'β版ではオンライン応援機能を準備中です'

export function isValidHttpUrl(url: string | undefined): url is string {
  if (!url?.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function canAccessStaffAreas(): boolean {
  return IS_DEV
}

export function canAccessPerformerAreas(): boolean {
  return IS_DEV
}

export function canProcessOnlineSupport(): boolean {
  return IS_DEV
}

export function sanitizePersonaForProduction(persona: AppPersona): AppPersona {
  if (IS_DEV) return persona
  return 'visitor'
}

export function canWatchLiveStream(performer: Performer | undefined): boolean {
  if (!performer) return false
  if (performer.approvalStatus !== 'approved' || !performer.canStream) return false
  return isValidHttpUrl(performer.streamUrl)
}
