export type NotificationPromptReason = 'login' | 'follow' | 'reservation'
export const NOTIFICATION_PROMPT_EVENT = 'haku:notification-prompt'
const COOLDOWN = 14 * 24 * 60 * 60 * 1000
const key = (userId: string) => `haku:notification-prompt:v1:${userId}`
export function announceNotificationOpportunity(userId: string, reason: NotificationPromptReason) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PROMPT_EVENT, { detail: { userId, reason } }))
}
/** Persist before showing. Storage failure suppresses prompts instead of repeated nagging. */
export function claimNotificationPrompt(userId: string, now = Date.now()): boolean {
  try {
    const previous = JSON.parse(window.localStorage.getItem(key(userId)) || 'null')
    if (previous && (!Number.isFinite(previous.at) || !Number.isInteger(previous.count) || previous.count >= 3 || now - previous.at < COOLDOWN)) return false
    window.localStorage.setItem(key(userId), JSON.stringify({ at: now, count: (previous?.count ?? 0) + 1 }))
    return true
  } catch { return false }
}
