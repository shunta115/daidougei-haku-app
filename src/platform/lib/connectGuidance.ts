export type ConnectGuidanceStatus = {
  connected: boolean
  complete: boolean
  state?: string
  needsInformation?: boolean
  underReview?: boolean
}

export type ConnectGuidance = 'status_unavailable' | 'expired_link' | 'ready' | 'account_mismatch' | 'restricted' | 'needs_information' | 'under_review' | 'in_progress' | 'not_started'

/** Pure classification only. Does not read or modify Stripe or the database. */
export function classifyConnectGuidance(status: ConnectGuidanceStatus | null, statusUnavailable: boolean, expiredLink = false): ConnectGuidance {
  if (statusUnavailable) return 'status_unavailable'
  if (status?.complete) return 'ready'
  if (status?.state === 'account_mismatch') return 'account_mismatch'
  if (expiredLink) return 'expired_link'
  if (status?.state === 'restricted') return 'restricted'
  if (status?.needsInformation) return 'needs_information'
  if (status?.underReview) return 'under_review'
  if (status?.connected) return 'in_progress'
  return 'not_started'
}
